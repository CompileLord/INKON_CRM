export interface OrgSettings {
  org_name: string;
  notify_payments: boolean;
  notify_debts: boolean;
  updated_at?: string;
}

export interface OrgSettingsUpdate {
  org_name?: string;
  notify_payments?: boolean;
  notify_debts?: boolean;
}
