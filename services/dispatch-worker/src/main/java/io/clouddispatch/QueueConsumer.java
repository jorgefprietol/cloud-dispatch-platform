package io.clouddispatch;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.sqs.SqsClient;

@Component
public class QueueConsumer {
    private static final Logger log = LoggerFactory.getLogger(QueueConsumer.class);
    private final SqsClient sqs;
    private final DispatchProcessor processor;
    private final String queue;
    public QueueConsumer(SqsClient sqs, DispatchProcessor processor, Environment env) {
        this.sqs = sqs; this.processor = processor; this.queue = env.getRequiredProperty("dispatch.queue-url");
    }
    @Scheduled(fixedDelay = 1000)
    public void poll() {
        try {
            var messages = sqs.receiveMessage(r -> r.queueUrl(queue).waitTimeSeconds(10).maxNumberOfMessages(1).visibilityTimeout(120)).messages();
            for (var message : messages) {
                try {
                    processor.process(message.body());
                    sqs.deleteMessage(r -> r.queueUrl(queue).receiptHandle(message.receiptHandle()));
                    log.info("Dispatch completed messageId={}", message.messageId());
                } catch (Exception error) {
                    if (error instanceof InterruptedException) { Thread.currentThread().interrupt(); return; }
                    log.warn("Dispatch failed messageId={}; message retained for retry/DLQ", message.messageId(), error);
                }
            }
        } catch (Exception error) { log.error("Queue polling failed", error); }
    }
}
