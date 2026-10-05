package io.clouddispatch;

import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.sns.SnsClient;

@Component
public class DispatchProcessor {
    private final JsonMapper mapper;
    private final S3Client s3;
    private final SnsClient sns;
    private final Environment env;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    public DispatchProcessor(JsonMapper mapper, S3Client s3, SnsClient sns, Environment env) {
        this.mapper = mapper; this.s3 = s3; this.sns = sns; this.env = env;
        if (env.getRequiredProperty("dispatch.worker-secret").length() < 32) throw new IllegalArgumentException("Worker secret must contain at least 32 characters");
    }
    public void process(String body) throws Exception {
        var event = mapper.readValue(body, DispatchEvent.class); event.validate();
        var report = Map.of("orderId", event.orderId(), "eventId", event.eventId(), "trackingCode", event.trackingCode(),
            "destination", event.destination(), "route", event.route(), "amount", event.amount(), "status", "dispatched");
        String json = mapper.writeValueAsString(report);
        // Deterministic report and tracking IDs make retries safe after a crash or SQS redelivery.
        s3.putObject(r -> r.bucket(env.getRequiredProperty("dispatch.bucket")).key(event.reportKey()).contentType("application/json"), RequestBody.fromString(json));
        var request = HttpRequest.newBuilder(URI.create(env.getRequiredProperty("dispatch.api-url") + "/internal/orders/" + event.orderId() + "/fulfill"))
            .timeout(Duration.ofSeconds(15)).header("Content-Type", "application/json")
            .header("X-Worker-Secret", env.getRequiredProperty("dispatch.worker-secret"))
            .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(Map.of("trackingCode", event.trackingCode(), "reportKey", event.reportKey())))).build();
        var response = http.send(request, HttpResponse.BodyHandlers.discarding());
        if (response.statusCode() != 204) throw new IllegalStateException("Fulfillment callback returned " + response.statusCode());
        String topic = env.getProperty("dispatch.topic-arn", "");
        if (!topic.isBlank()) sns.publish(r -> r.topicArn(topic).message(json));
    }
}
