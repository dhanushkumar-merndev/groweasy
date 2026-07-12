import type { Template } from "./types.js"

/**
 * Pseudo-user that owns the system-wide default template.
 * Templates owned by systemUserId are locked — users cannot edit or delete them.
 */
export const systemUserId = "system"

/** Well-known UUID for the built-in CRM template. */
export const defaultTemplateId = "00000000-0000-4000-8000-000000000001"

/**
 * System-wide default CRM template seeded for every user.
 * Owned by systemUserId so it's visible to all users but immutable.
 */
export const defaultTemplate: Template = {
  id: defaultTemplateId,
  user_id: systemUserId,
  name: "Grow Easy CRM",
  columns_config: [
    {
      key: "created_at",
      label: "Created At",
      source_hints: ["created", "created at", "created time", "lead date", "timestamp"],
      required: false,
      format_rules: ["date_dd_mm_yyyy"],
      export_title: "created_at",
    },
    {
      key: "name",
      label: "Name",
      source_hints: ["name", "full name", "lead name", "customer name", "contact name"],
      required: false,
      format_rules: ["title_case", "dash_to_blank"],
      export_title: "name",
    },
    {
      key: "email",
      label: "Email",
      source_hints: ["email", "email id", "mail", "mail id", "contact details"],
      required: false,
      format_rules: ["lowercase", "dash_to_blank"],
      export_title: "email",
    },
    {
      key: "country_code",
      label: "Country Code",
      source_hints: ["country code", "dial code", "phone code", "contact details"],
      required: false,
      format_rules: ["dash_to_blank"],
      export_title: "country_code",
    },
    {
      key: "mobile_without_country_code",
      label: "Mobile Without Country Code",
      source_hints: ["mobile", "phone", "number", "whatsapp", "contact details"],
      required: false,
      format_rules: ["digits_only", "last_10_digits", "dash_to_blank"],
      export_title: "mobile_without_country_code",
    },
    {
      key: "company",
      label: "Company",
      source_hints: ["company", "business", "organization", "firm"],
      required: false,
      format_rules: ["title_case", "dash_to_blank"],
      export_title: "company",
    },
    {
      key: "city",
      label: "City",
      source_hints: ["city", "location", "area", "city/state"],
      required: false,
      format_rules: ["title_case", "dash_to_blank"],
      export_title: "city",
    },
    {
      key: "state",
      label: "State",
      source_hints: ["state", "province", "region", "city/state"],
      required: false,
      format_rules: ["title_case", "dash_to_blank"],
      export_title: "state",
    },
    {
      key: "country",
      label: "Country",
      source_hints: ["country", "nation", "location"],
      required: false,
      format_rules: ["title_case", "dash_to_blank"],
      export_title: "country",
    },
    {
      key: "lead_owner",
      label: "Lead Owner",
      source_hints: ["owner", "lead owner", "agent", "sales person", "assigned to"],
      required: false,
      format_rules: ["dash_to_blank"],
      export_title: "lead_owner",
    },
    {
      key: "crm_status",
      label: "CRM Status",
      source_hints: ["status", "crm status", "stage", "lead status"],
      required: false,
      format_rules: ["uppercase", "dash_to_blank"],
      export_title: "crm_status",
    },
    {
      key: "crm_note",
      label: "CRM Note",
      source_hints: ["note", "notes", "remarks", "comment", "description", "follow up"],
      required: false,
      format_rules: ["dash_to_blank"],
      export_title: "crm_note",
    },
    {
      key: "data_source",
      label: "Data Source",
      source_hints: ["source", "lead source", "campaign", "platform", "data source"],
      required: false,
      format_rules: ["lowercase", "dash_to_blank"],
      export_title: "data_source",
    },
    {
      key: "possession_time",
      label: "Possession Time",
      source_hints: ["possession", "possession time", "timeline", "availability"],
      required: false,
      format_rules: ["dash_to_blank"],
      export_title: "possession_time",
    },
    {
      key: "description",
      label: "Description",
      source_hints: ["description", "descrptn", "free txt", "message", "requirement"],
      required: false,
      format_rules: ["dash_to_blank"],
      export_title: "description",
    },
  ],
  formatting_rules: {},
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
}
