package io.clouddispatch;

import java.net.URI;
import java.time.Duration;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableScheduling;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.sns.SnsClient;

@SpringBootApplication
@EnableScheduling
public class DispatchApplication {
    public static void main(String[] args) { SpringApplication.run(DispatchApplication.class, args); }
    @Bean SqsClient sqs(Environment env) {
        var builder = SqsClient.builder().region(Region.of(env.getRequiredProperty("dispatch.region"))).overrideConfiguration(timeouts());
        String endpoint = env.getProperty("dispatch.endpoint", "");
        if (!endpoint.isBlank()) builder.endpointOverride(URI.create(endpoint));
        return builder.build();
    }
    @Bean S3Client s3(Environment env) {
        var builder = S3Client.builder().region(Region.of(env.getRequiredProperty("dispatch.region"))).forcePathStyle(true).overrideConfiguration(timeouts());
        String endpoint = env.getProperty("dispatch.endpoint", "");
        if (!endpoint.isBlank()) builder.endpointOverride(URI.create(endpoint));
        return builder.build();
    }
    @Bean SnsClient sns(Environment env) {
        var builder = SnsClient.builder().region(Region.of(env.getRequiredProperty("dispatch.region"))).overrideConfiguration(timeouts());
        String endpoint = env.getProperty("dispatch.endpoint", "");
        if (!endpoint.isBlank()) builder.endpointOverride(URI.create(endpoint));
        return builder.build();
    }
    private ClientOverrideConfiguration timeouts() { return ClientOverrideConfiguration.builder().apiCallTimeout(Duration.ofSeconds(20)).apiCallAttemptTimeout(Duration.ofSeconds(15)).build(); }
}
