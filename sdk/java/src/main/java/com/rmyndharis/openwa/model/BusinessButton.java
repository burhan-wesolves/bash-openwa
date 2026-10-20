package com.rmyndharis.openwa.model;

import java.util.List;

/** Baileys-only business message payload. */
public record BusinessButton(
    String type,
    String displayText,
    String id,
    String url,
    String phoneNumber,
    String copyCode,
    String currency,
    String name,
    String keyType,
    String key) {
    public static Builder builder() { return new Builder(); }
    public static final class Builder {
        private String type;
        private String displayText;
        private String id;
        private String url;
        private String phoneNumber;
        private String copyCode;
        private String currency;
        private String name;
        private String keyType;
        private String key;
        public Builder type(String value) { this.type = value; return this; }
        public Builder displayText(String value) { this.displayText = value; return this; }
        public Builder id(String value) { this.id = value; return this; }
        public Builder url(String value) { this.url = value; return this; }
        public Builder phoneNumber(String value) { this.phoneNumber = value; return this; }
        public Builder copyCode(String value) { this.copyCode = value; return this; }
        public Builder currency(String value) { this.currency = value; return this; }
        public Builder name(String value) { this.name = value; return this; }
        public Builder keyType(String value) { this.keyType = value; return this; }
        public Builder key(String value) { this.key = value; return this; }
        public BusinessButton build() { return new BusinessButton(type, displayText, id, url, phoneNumber, copyCode, currency, name, keyType, key); }
    }
}
