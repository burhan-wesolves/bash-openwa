package com.rmyndharis.openwa.model;

import java.util.List;

/** Baileys-only business message payload. */
public record SendListRequest(
    String chatId,
    String title,
    String description,
    String footerText,
    String buttonText,
    List<BusinessListSection> sections,
    String quotedMessageId) {
    public static Builder builder() { return new Builder(); }
    public static final class Builder {
        private String chatId;
        private String title;
        private String description;
        private String footerText;
        private String buttonText;
        private List<BusinessListSection> sections;
        private String quotedMessageId;
        public Builder chatId(String value) { this.chatId = value; return this; }
        public Builder title(String value) { this.title = value; return this; }
        public Builder description(String value) { this.description = value; return this; }
        public Builder footerText(String value) { this.footerText = value; return this; }
        public Builder buttonText(String value) { this.buttonText = value; return this; }
        public Builder sections(List<BusinessListSection> value) { this.sections = value; return this; }
        public Builder quotedMessageId(String value) { this.quotedMessageId = value; return this; }
        public SendListRequest build() { return new SendListRequest(chatId, title, description, footerText, buttonText, sections, quotedMessageId); }
    }
}
