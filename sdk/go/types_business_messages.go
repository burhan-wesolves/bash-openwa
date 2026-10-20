package openwa

// Business message types are supported by the Baileys engine.
type BusinessButton struct {
	Type        string `json:"type"`
	DisplayText string `json:"displayText,omitempty"`
	Id          string `json:"id,omitempty"`
	Url         string `json:"url,omitempty"`
	PhoneNumber string `json:"phoneNumber,omitempty"`
	CopyCode    string `json:"copyCode,omitempty"`
	Currency    string `json:"currency,omitempty"`
	Name        string `json:"name,omitempty"`
	KeyType     string `json:"keyType,omitempty"`
	Key         string `json:"key,omitempty"`
}

type BusinessListRow struct {
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	RowId       string `json:"rowId"`
}

type BusinessListSection struct {
	Title string            `json:"title"`
	Rows  []BusinessListRow `json:"rows"`
}

type BusinessCarouselCard struct {
	Body     string           `json:"body"`
	Footer   string           `json:"footer,omitempty"`
	ImageUrl string           `json:"imageUrl,omitempty"`
	Buttons  []BusinessButton `json:"buttons"`
}

type SendButtonsRequest struct {
	ChatId          string           `json:"chatId"`
	Title           string           `json:"title"`
	Description     string           `json:"description,omitempty"`
	Footer          string           `json:"footer,omitempty"`
	ThumbnailUrl    string           `json:"thumbnailUrl,omitempty"`
	Buttons         []BusinessButton `json:"buttons"`
	QuotedMessageId string           `json:"quotedMessageId,omitempty"`
}

type SendListRequest struct {
	ChatId          string                `json:"chatId"`
	Title           string                `json:"title"`
	Description     string                `json:"description,omitempty"`
	FooterText      string                `json:"footerText,omitempty"`
	ButtonText      string                `json:"buttonText"`
	Sections        []BusinessListSection `json:"sections"`
	QuotedMessageId string                `json:"quotedMessageId,omitempty"`
}

type SendCarouselRequest struct {
	ChatId          string                 `json:"chatId"`
	Body            string                 `json:"body"`
	Cards           []BusinessCarouselCard `json:"cards"`
	QuotedMessageId string                 `json:"quotedMessageId,omitempty"`
}
