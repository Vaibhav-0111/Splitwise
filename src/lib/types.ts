export type Profile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
};

export type Group = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
};

export type GroupMember = {
  id: string;
  group_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  profiles?: Profile;
};

export type SplitType = "equal" | "unequal" | "percentage" | "shares";

export type Expense = {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  currency: string;
  paid_by: string;
  created_by: string;
  split_type: SplitType;
  expense_date: string;
  created_at: string;
  updated_at: string;
  payer?: Profile;
};

export type ExpenseSplit = {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  percentage: number | null;
  shares: number | null;
  profiles?: Profile;
};

export type ExpenseMessage = {
  id: string;
  expense_id: string;
  user_id: string;
  message: string;
  created_at: string;
  profiles?: Profile;
};

export type Settlement = {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount: number;
  note: string | null;
  created_at: string;
};

export type GroupBalance = {
  user_id: string;
  display_name: string;
  net_balance: number;
};

export type PairwiseBalance = {
  debtor: string;
  debtor_name: string;
  creditor: string;
  creditor_name: string;
  amount: number;
};
