package com.rmyndharis.openwa.model;

import java.util.List;

/** Baileys-only business message payload. */
public record BusinessListSection(
    String title,
    List<BusinessListRow> rows) {
    public static Builder builder() { return new Builder(); }
    public static final class Builder {
        private String title;
        private List<BusinessListRow> rows;
        public Builder title(String value) { this.title = value; return this; }
        public Builder rows(List<BusinessListRow> value) { this.rows = value; return this; }
        public BusinessListSection build() { return new BusinessListSection(title, rows); }
    }
}
