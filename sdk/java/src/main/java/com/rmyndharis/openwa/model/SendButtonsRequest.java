package com.rmyndharis.openwa.model;

import java.util.List;

/** Baileys-only business message payload. */
public record SendButtonsRequest(
    String chatId,
    String title,
    String description,
    String footer,
    String thumbnailUrl,
    List<BusinessButton> buttons,
    String quotedMessageId) {
    public static Builder builder() { return new Builder(); }
    public static final class Builder {
        private String chatId;
        private String title;
        private String description;
        private String footer;
        private String thumbnailUrl;
        private List<BusinessButton> buttons;
        private String quotedMessageId;
        public Builder chatId(String value) { this.chatId = value; return this; }
        public Builder title(String value) { this.title = value; return this; }
        public Builder description(String value) { this.description = value; return this; }
        public Builder footer(String value) { this.footer = value; return this; }
        public Builder thumbnailUrl(String value) { this.thumbnailUrl = value; return this; }
        public Builder buttons(List<BusinessButton> value) { this.buttons = value; return this; }
        public Builder quotedMessageId(String value) { this.quotedMessageId = value; return this; }
        public SendButtonsRequest build() { return new SendButtonsRequest(chatId, title, description, footer, thumbnailUrl, buttons, quotedMessageId); }
    }
}
