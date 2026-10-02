package io.clouddispatch;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
class DispatchEventTest {
    private DispatchEvent event(int version, String priority) { return new DispatchEvent(version, UUID.randomUUID(), UUID.fromString("01234567-89ab-4cde-8012-3456789abcde"), "Quito", priority, new BigDecimal("150.25")); }
    @Test void retryProducesSameTrackingAndReport() {
        var a = event(1, "express"); var b = event(1, "express");
        assertEquals(a.trackingCode(), b.trackingCode()); assertEquals(a.reportKey(), b.reportKey()); assertEquals("CD-0123456789AB", a.trackingCode());
    }
    @Test void expressUsesPriorityNetwork() { assertEquals("priority-network", event(1, "express").route()); assertEquals("standard-network", event(1, "standard").route()); }
    @Test void rejectsUnknownSchemaAndPriority() { assertThrows(IllegalArgumentException.class, () -> event(2,"standard").validate()); assertThrows(IllegalArgumentException.class, () -> event(1,"urgent").validate()); }
}
