export interface OrgSettings {
  org_name: string;
  address: string | null;
  phone: string | null;
  notify_payments: boolean;
  notify_debts: boolean;
  updated_at?: string;
}

export interface OrgSettingsUpdate {
  org_name?: string | null;
  address?: string | null;
  phone?: string | null;
  notify_payments?: boolean | null;
  notify_debts?: boolean | null;
}

export interface TelegramBotCheck {
  reachable: boolean;
  bot_username: string | null;
}
