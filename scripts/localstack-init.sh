#!/bin/sh
set -eu
awslocal s3 mb s3://dispatch-reports
awslocal sqs create-queue --queue-name dispatch-dlq > /dev/null
awslocal sqs create-queue --queue-name dispatch --attributes '{"VisibilityTimeout":"120","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:dispatch-dlq\",\"maxReceiveCount\":\"5\"}"}' > /dev/null
touch /tmp/dispatch-ready
