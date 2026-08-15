export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      jobs: {
        Row: {
          applied_on: string | null;
          company: string;
          created_at: string;
          dedupe_key: string;
          description: string;
          discovered_on: string;
          employment_type: Database["public"]["Enums"]["employment_type"];
          id: string;
          location: string;
          notes: string;
          salary: string;
          source: string;
          source_url: string;
          status: Database["public"]["Enums"]["job_status"];
          technologies: string[];
          title: string;
          updated_at: string;
          user_id: string;
          work_mode: Database["public"]["Enums"]["work_mode"];
        };
        Insert: {
          applied_on?: string | null;
          company: string;
          created_at?: string;
          dedupe_key: string;
          description?: string;
          discovered_on: string;
          employment_type?: Database["public"]["Enums"]["employment_type"];
          id?: string;
          location?: string;
          notes?: string;
          salary?: string;
          source?: string;
          source_url?: string;
          status?: Database["public"]["Enums"]["job_status"];
          technologies?: string[];
          title: string;
          updated_at?: string;
          user_id: string;
          work_mode?: Database["public"]["Enums"]["work_mode"];
        };
        Update: {
          applied_on?: string | null;
          company?: string;
          created_at?: string;
          dedupe_key?: string;
          description?: string;
          discovered_on?: string;
          employment_type?: Database["public"]["Enums"]["employment_type"];
          id?: string;
          location?: string;
          notes?: string;
          salary?: string;
          source?: string;
          source_url?: string;
          status?: Database["public"]["Enums"]["job_status"];
          technologies?: string[];
          title?: string;
          updated_at?: string;
          user_id?: string;
          work_mode?: Database["public"]["Enums"]["work_mode"];
        };
        Relationships: [];
      };
      job_status_history: {
        Row: {
          changed_at: string;
          from_status: Database["public"]["Enums"]["job_status"] | null;
          id: string;
          job_id: string;
          to_status: Database["public"]["Enums"]["job_status"];
        };
        Insert: {
          changed_at?: string;
          from_status?: Database["public"]["Enums"]["job_status"] | null;
          id?: string;
          job_id: string;
          to_status: Database["public"]["Enums"]["job_status"];
        };
        Update: {
          changed_at?: string;
          from_status?: Database["public"]["Enums"]["job_status"] | null;
          id?: string;
          job_id?: string;
          to_status?: Database["public"]["Enums"]["job_status"];
        };
        Relationships: [];
      };
      knowledge_files: {
        Row: {
          created_at: string;
          id: string;
          mime_type: string;
          object_path: string;
          original_name: string;
          size_bytes: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mime_type: string;
          object_path: string;
          original_name: string;
          size_bytes: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mime_type?: string;
          object_path?: string;
          original_name?: string;
          size_bytes?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      user_filters: {
        Row: {
          excluded_technologies: string[];
          included_technologies: string[];
          preferred_titles: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          excluded_technologies?: string[];
          included_technologies?: string[];
          preferred_titles?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          excluded_technologies?: string[];
          included_technologies?: string[];
          preferred_titles?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      employment_type:
        | "full_time"
        | "part_time"
        | "contract"
        | "internship"
        | "temporary"
        | "unspecified";
      job_status:
        | "new"
        | "saved"
        | "applied"
        | "screening"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn";
      work_mode: "remote" | "hybrid" | "onsite" | "unspecified";
    };
    CompositeTypes: Record<string, never>;
  };
};
