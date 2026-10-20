package com.rmyndharis.openwa.model;

import java.util.List;

/** Baileys-only business message payload. */
public record BusinessListRow(
    String title,
    String description,
    String rowId) {
    public static Builder builder() { return new Builder(); }
    public static final class Builder {
        private String title;
        private String description;
        private String rowId;
        public Builder title(String value) { this.title = value; return this; }
        public Builder description(String value) { this.description = value; return this; }
        public Builder rowId(String value) { this.rowId = value; return this; }
        public BusinessListRow build() { return new BusinessListRow(title, description, rowId); }
    }
}
