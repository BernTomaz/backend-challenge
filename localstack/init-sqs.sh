#!/bin/sh
set -e

awslocal sqs create-queue \
  --queue-name wager-transactions-dlq.fifo \
  --attributes FifoQueue=true

awslocal sqs create-queue \
  --queue-name wager-transactions.fifo \
  --attributes FifoQueue=true
