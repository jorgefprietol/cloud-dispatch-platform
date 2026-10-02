package io.clouddispatch;

import java.math.BigDecimal;
import java.util.UUID;

public record DispatchEvent(int version, UUID eventId, UUID orderId, String destination, String priority, BigDecimal amount) {
    public void validate() {
        if (version != 1 || eventId == null || orderId == null || destination == null || destination.isBlank()
            || !("standard".equals(priority) || "express".equals(priority)) || amount == null || amount.signum() <= 0)
            throw new IllegalArgumentException("Invalid dispatch event or unsupported version");
    }
    public String trackingCode() { return "CD-" + orderId.toString().replace("-", "").substring(0, 12).toUpperCase(java.util.Locale.ROOT); }
    public String reportKey() { return "dispatch/" + orderId + ".json"; }
    public String route() { return "express".equals(priority) ? "priority-network" : "standard-network"; }
}
