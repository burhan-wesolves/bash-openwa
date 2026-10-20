package com.rmyndharis.openwa.model;

import java.util.List;

/** Baileys-only business message payload. */
public record BusinessCarouselCard(
    String body,
    String footer,
    String imageUrl,
    List<BusinessButton> buttons) {
    public static Builder builder() { return new Builder(); }
    public static final class Builder {
        private String body;
        private String footer;
        private String imageUrl;
        private List<BusinessButton> buttons;
        public Builder body(String value) { this.body = value; return this; }
        public Builder footer(String value) { this.footer = value; return this; }
        public Builder imageUrl(String value) { this.imageUrl = value; return this; }
        public Builder buttons(List<BusinessButton> value) { this.buttons = value; return this; }
        public BusinessCarouselCard build() { return new BusinessCarouselCard(body, footer, imageUrl, buttons); }
    }
}
