package io.clouddispatch;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.sns.SnsClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
class DispatchProcessorTest {
    private final String body = "{\"version\":1,\"eventId\":\"11234567-89ab-4cde-8012-3456789abcde\",\"orderId\":\"01234567-89ab-4cde-8012-3456789abcde\",\"destination\":\"Quito\",\"priority\":\"express\",\"amount\":10.25}";
    @Test void storesReportThenConfirmsAndPublishes() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/internal/orders/", exchange -> {
            assertEquals("a".repeat(40),exchange.getRequestHeaders().getFirst("X-Worker-Secret"));
            assertTrue(new String(exchange.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8).contains("CD-0123456789AB"));
            exchange.sendResponseHeaders(204,-1);exchange.close();
        });server.start();
        try {
            var s3=mock(S3Client.class);var sns=mock(SnsClient.class);
            var env=new MockEnvironment().withProperty("dispatch.worker-secret","a".repeat(40)).withProperty("dispatch.bucket","reports").withProperty("dispatch.api-url","http://127.0.0.1:"+server.getAddress().getPort()).withProperty("dispatch.topic-arn","arn:aws:sns:us-east-1:111111111111:completed");
            new DispatchProcessor(new ObjectMapper(),s3,sns,env).process(body);
            var order=inOrder(s3,sns);order.verify(s3).putObject(any(Consumer.class),any(RequestBody.class));order.verify(sns).publish(any(Consumer.class));
        } finally {server.stop(0);}
    }
    @Test void callbackFailureDoesNotPublishCompletion() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",exchange->{exchange.sendResponseHeaders(500,-1);exchange.close();});server.start();
        try {
            var s3=mock(S3Client.class);var sns=mock(SnsClient.class);
            var env=new MockEnvironment().withProperty("dispatch.worker-secret","a".repeat(40)).withProperty("dispatch.bucket","reports").withProperty("dispatch.api-url","http://127.0.0.1:"+server.getAddress().getPort()).withProperty("dispatch.topic-arn","arn:test");
            assertThrows(IllegalStateException.class,()->new DispatchProcessor(new ObjectMapper(),s3,sns,env).process(body));verifyNoInteractions(sns);
        } finally {server.stop(0);}
    }
}
