# Arquitetura

## Autenticação

Autenticação real não foi implementada nesta etapa.

O README informa que autenticação não pontua diretamente e não deve competir com correção financeira, concorrência e idempotência. Por isso, a decisão atual é manter apenas um ponto de extensão no código:

- `NoopAuthGuard`

Em uma implementação completa, a API seria protegida por um Identity Provider externo compatível com OIDC, como Keycloak ou Zitadel. Não será criada tabela própria de usuários nem autenticação artesanal com senha.

Health checks permanecerão abertos. Mensagens vindas da fila serão tratadas como canal interno confiável, mas os dados do provedor continuam sujeitos às validações de domínio.

## ORM

O ORM escolhido é o **MikroORM**, opção preferencial no README.

Motivos:

- suporte a `EntityManager.transactional()`;
- suporte a `LockMode`;
- integração com PostgreSQL;
- migrations versionadas;
- separação entre domínio e persistência.

As classes de domínio não usam decorators de ORM nem decorators do NestJS. A persistência usa records separados em `src/infrastructure/database/entities`.

## Money

O domínio não usa `number`, `float` ou `double` para dinheiro.

Nos contratos, dinheiro entra e sai como string decimal com duas casas:

```json
{ "amount": "25.00", "currency": "BRL" }
```

Internamente, `Money` usa `bigint` em centavos. Essa escolha evita erro de ponto flutuante e mantém a implementação simples.

Na persistência, valores monetários usam `numeric(18, 2)` no PostgreSQL e são convertidos de/para string decimal.

O modelo suporta múltiplas moedas, embora o desafio possa assumir `BRL`.

## Transições de WagerTransaction

Transações nascem em `PENDING`.

Transições válidas:

| Estado atual | Transição | Novo estado |
|---|---|---|
| `PENDING` | `markProcessed` | `PROCESSED` |
| `PENDING` | `markPendingReference` | `PENDING_REFERENCE` |
| `PENDING` | `reject` | `REJECTED` |
| `PENDING` | `fail` | `FAILED` |
| `PENDING_REFERENCE` | `markProcessed` | `PROCESSED` |
| `PENDING_REFERENCE` | `reject` | `REJECTED` |
| `PENDING_REFERENCE` | `fail` | `FAILED` |

Estados terminais:

- `PROCESSED`;
- `REJECTED`;
- `FAILED`.

Uma transação terminal não muda mais de estado. Tentar alterar uma transação terminal lança `InvalidTransactionStateError`.

`OPENING` é uma operação interna e não deve ser submetida pela API ou pela fila.

## Interpretações de Regra de Negócio

As regras de `BET`, `WIN`, `LOSS`, `REFUND` e `ROLLBACK` ficam concentradas em `processWagerTransaction`.

Comportamento adotado:

| Operação | Efeito | Ledger |
|---|---|---|
| `BET` | débito | `DEBIT` |
| `WIN` | crédito | `CREDIT` |
| `LOSS` | nenhum | não gera |
| `REFUND` | crédito de uma `BET` processada | `CREDIT` |
| `ROLLBACK` | movimento inverso da referência | invertido |

Rejeições não alteram saldo e não geram ledger.

Rollback que produziria saldo negativo usa código próprio, separado de aposta sem saldo, porque são situações operacionais diferentes.

## Referências Fora de Ordem

`REFUND` e `ROLLBACK` exigem referência.

Se a referência ainda não existir, a transação fica em `PENDING_REFERENCE`.

Decisão atual:

- limite padrão: `5` tentativas;
- backoff exponencial;
- limite máximo do backoff: `300` segundos;
- ao esgotar tentativas: `REJECTED` com `REFERENCE_NOT_FOUND`.

O limite é pequeno para evitar pendências indefinidas e manter a falha auditável. O worker agendado real será implementado em etapa posterior.

## Códigos de Falha

Os códigos de falha são estáveis e legíveis por máquina.

| Código | Uso |
|---|---|
| `INSUFFICIENT_BALANCE` | aposta sem saldo suficiente |
| `MISSING_REFERENCE` | referência ainda ausente durante validação |
| `REFERENCE_NOT_FOUND` | referência ausente após esgotar tentativas |
| `INVALID_REFERENCE` | referência encontrada, mas incompatível |
| `DUPLICATE_REVERSAL` | tentativa de reverter a mesma referência pelo mesmo tipo |
| `ROLLBACK_WOULD_MAKE_BALANCE_NEGATIVE` | rollback produziria saldo negativo |
| `INFRASTRUCTURE_FAILURE` | falha permanente de infraestrutura |

## Estratégia Transacional e Concorrência

A unidade de concorrência é `walletId`.

Estratégia adotada:

- transação SQL;
- lock pessimista na wallet com `LockMode.PESSIMISTIC_WRITE`;
- PostgreSQL como garantia final;
- nenhum lock global;
- wallets diferentes podem ser processadas em paralelo.

O fluxo persistente executa:

1. abre transação;
2. carrega a wallet com lock;
3. processa a transação de aposta;
4. atualiza saldo/version da wallet;
5. persiste a transação;
6. persiste ledger quando houver;
7. confirma tudo junto.

Essa estratégia mantém o sistema correto com múltiplas instâncias porque o lock vive no PostgreSQL, não na memória da aplicação.

## Idempotência HTTP

O header `Idempotency-Key` é obrigatório em `POST /wagering/transactions` e é a fonte da verdade para replay.

O `payloadHash` é calculado com SHA-256 sobre um JSON canônico do payload de negócio. O algoritmo:

1. remove metadados de transporte, como headers;
2. mantém os campos de negócio recebidos no corpo da requisição;
3. ordena as chaves de objetos em ordem alfabética;
4. serializa arrays na ordem recebida;
5. serializa valores primitivos com `JSON.stringify`;
6. aplica SHA-256 e grava o resultado em hexadecimal.

Campos considerados no hash:

- `providerId`;
- `externalTransactionId`;
- `playerId`;
- `walletId`;
- `roundId`;
- `gameId`;
- `kind`;
- `money`;
- `referenceExternalTransactionId`, quando informado.

Requisição com mesma key e mesmo hash retorna replay. Mesma key com hash diferente é conflito de idempotência.
