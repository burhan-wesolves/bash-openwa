package com.rmyndharis.openwa.model;

import java.util.List;

/** Baileys-only business message payload. */
public record SendCarouselRequest(
    String chatId,
    String body,
    List<BusinessCarouselCard> cards,
    String quotedMessageId) {
    public static Builder builder() { return new Builder(); }
    public static final class Builder {
        private String chatId;
        private String body;
        private List<BusinessCarouselCard> cards;
        private String quotedMessageId;
        public Builder chatId(String value) { this.chatId = value; return this; }
        public Builder body(String value) { this.body = value; return this; }
        public Builder cards(List<BusinessCarouselCard> value) { this.cards = value; return this; }
        public Builder quotedMessageId(String value) { this.quotedMessageId = value; return this; }
        public SendCarouselRequest build() { return new SendCarouselRequest(chatId, body, cards, quotedMessageId); }
    }
}
