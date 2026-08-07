export interface DocumentItem {
  id: number;
  owner_type: "student" | "mentor";
  owner_id: number;
  journal_id?: number | null;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by_id: number;
  uploaded_at: string;
  is_deleted: boolean;
}

export interface UploadDocumentParams {
  file: File;
  owner_type: "student" | "mentor";
  owner_id: number;
  journal_id?: number;
}

export interface ListDocumentsParams {
  owner_type?: "student" | "mentor";
  owner_id?: number;
  journal_id?: number;
  page?: number;
  page_size?: number;
}
