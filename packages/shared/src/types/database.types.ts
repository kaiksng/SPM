export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clarifications: {
        Row: {
          event_id: string
          id: string
          permitted_fields: string[]
          question: string
          requested_at: string
          requested_by: string
          resolved_at: string | null
          resolved_by: string | null
          responded_at: string | null
          responded_by: string | null
          response: string | null
          status: Database["public"]["Enums"]["clarification_status"]
        }
        Insert: {
          event_id: string
          id?: string
          permitted_fields?: string[]
          question: string
          requested_at?: string
          requested_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: Database["public"]["Enums"]["clarification_status"]
        }
        Update: {
          event_id?: string
          id?: string
          permitted_fields?: string[]
          question?: string
          requested_at?: string
          requested_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: Database["public"]["Enums"]["clarification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "clarifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clarifications_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clarifications_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clarifications_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_arrangement_updates: {
        Row: {
          event_id: string
          id: number
          note: string | null
          requirement_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          event_id: string
          id?: never
          note?: string | null
          requirement_id: string
          status: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          event_id?: string
          id?: never
          note?: string | null
          requirement_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_arrangement_updates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_arrangement_updates_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "event_equipment_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_arrangement_updates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_items: {
        Row: {
          category: string | null
          code: string
          id: string
          name: string
          notes: string | null
          retired_at: string | null
          retired_by: string | null
          total_quantity: number
        }
        Insert: {
          category?: string | null
          code: string
          id?: string
          name: string
          notes?: string | null
          retired_at?: string | null
          retired_by?: string | null
          total_quantity: number
        }
        Update: {
          category?: string | null
          code?: string
          id?: string
          name?: string
          notes?: string | null
          retired_at?: string | null
          retired_by?: string | null
          total_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipment_items_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_reservation_events: {
        Row: {
          action: string
          actor: string | null
          details: Json | null
          id: number
          occurred_at: string
          reservation_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          details?: Json | null
          id?: never
          occurred_at?: string
          reservation_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          details?: Json | null
          id?: never
          occurred_at?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_reservation_events_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_reservation_events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "equipment_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_reservations: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          ends_at: string
          equipment_item_id: string
          event_id: string
          id: string
          needs_recheck: boolean
          quantity: number
          recheck_reason: string | null
          released_at: string | null
          released_by: string | null
          requested_at: string
          requested_by: string
          requirement_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          ends_at: string
          equipment_item_id: string
          event_id: string
          id?: string
          needs_recheck?: boolean
          quantity: number
          recheck_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          requested_at?: string
          requested_by: string
          requirement_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          ends_at?: string
          equipment_item_id?: string
          event_id?: string
          id?: string
          needs_recheck?: boolean
          quantity?: number
          recheck_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          requested_at?: string
          requested_by?: string
          requirement_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "equipment_reservations_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_reservations_equipment_item_id_fkey"
            columns: ["equipment_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_reservations_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_reservations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_reservations_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "event_equipment_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_unavailability: {
        Row: {
          ended_at: string | null
          ended_by: string | null
          ends_at: string
          equipment_item_id: string
          id: string
          quantity: number
          reason: string
          recorded_at: string
          recorded_by: string
          removed_at: string | null
          removed_by: string | null
          starts_at: string
        }
        Insert: {
          ended_at?: string | null
          ended_by?: string | null
          ends_at: string
          equipment_item_id: string
          id?: string
          quantity: number
          reason: string
          recorded_at?: string
          recorded_by: string
          removed_at?: string | null
          removed_by?: string | null
          starts_at: string
        }
        Update: {
          ended_at?: string | null
          ended_by?: string | null
          ends_at?: string
          equipment_item_id?: string
          id?: string
          quantity?: number
          reason?: string
          recorded_at?: string
          recorded_by?: string
          removed_at?: string | null
          removed_by?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_unavailability_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_unavailability_equipment_item_id_fkey"
            columns: ["equipment_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_unavailability_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_unavailability_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_unavailability_units: {
        Row: {
          unavailability_id: string
          unit_id: string
        }
        Insert: {
          unavailability_id: string
          unit_id: string
        }
        Update: {
          unavailability_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_unavailability_units_unavailability_id_fkey"
            columns: ["unavailability_id"]
            isOneToOne: false
            referencedRelation: "equipment_unavailability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_unavailability_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "equipment_units"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_units: {
        Row: {
          created_at: string
          created_by: string | null
          equipment_item_id: string
          id: string
          retired_at: string | null
          retired_by: string | null
          unit_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          equipment_item_id: string
          id?: string
          retired_at?: string | null
          retired_by?: string | null
          unit_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          equipment_item_id?: string
          id?: string
          retired_at?: string | null
          retired_by?: string | null
          unit_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipment_units_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_units_equipment_item_id_fkey"
            columns: ["equipment_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_units_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_change_requests: {
        Row: {
          event_id: string
          id: string
          requested_at: string
          requested_by: string
          requested_changes: Json
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          event_id: string
          id?: string
          requested_at?: string
          requested_by: string
          requested_changes: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          event_id?: string
          id?: string
          requested_at?: string
          requested_by?: string
          requested_changes?: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_change_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_change_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_coordinator_assignments: {
        Row: {
          changed_at: string
          changed_by: string | null
          ended_at: string | null
          event_id: string
          id: number
          new_coordinator_id: string
          previous_coordinator_id: string | null
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          ended_at?: string | null
          event_id: string
          id?: never
          new_coordinator_id: string
          previous_coordinator_id?: string | null
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          ended_at?: string | null
          event_id?: string
          id?: never
          new_coordinator_id?: string
          previous_coordinator_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_coordinator_assignments_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_coordinator_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_coordinator_assignments_new_coordinator_id_fkey"
            columns: ["new_coordinator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_coordinator_assignments_previous_coordinator_id_fkey"
            columns: ["previous_coordinator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_decisions: {
        Row: {
          decided_at: string
          decided_by: string
          decision: Database["public"]["Enums"]["event_decision_type"]
          event_id: string
          id: string
          rationale: string | null
        }
        Insert: {
          decided_at?: string
          decided_by: string
          decision: Database["public"]["Enums"]["event_decision_type"]
          event_id: string
          id?: string
          rationale?: string | null
        }
        Update: {
          decided_at?: string
          decided_by?: string
          decision?: Database["public"]["Enums"]["event_decision_type"]
          event_id?: string
          id?: string
          rationale?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_decisions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_equipment_changes: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          event_id: string
          id: number
          new_value: Json | null
          previous_value: Json | null
          requirement_id: string
        }
        Insert: {
          change_type: string
          changed_at?: string
          changed_by?: string | null
          event_id: string
          id?: never
          new_value?: Json | null
          previous_value?: Json | null
          requirement_id: string
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          event_id?: string
          id?: never
          new_value?: Json | null
          previous_value?: Json | null
          requirement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_equipment_changes_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_equipment_changes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_equipment_requirements: {
        Row: {
          equipment_item_id: string | null
          equipment_name: string
          event_id: string
          id: string
          notes: string | null
          quantity: number
          required_from: string | null
          required_until: string | null
        }
        Insert: {
          equipment_item_id?: string | null
          equipment_name: string
          event_id: string
          id?: string
          notes?: string | null
          quantity?: number
          required_from?: string | null
          required_until?: string | null
        }
        Update: {
          equipment_item_id?: string | null
          equipment_name?: string
          event_id?: string
          id?: string
          notes?: string | null
          quantity?: number
          required_from?: string | null
          required_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_equipment_requirements_equipment_item_id_fkey"
            columns: ["equipment_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_equipment_requirements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_field_changes: {
        Row: {
          changed_at: string
          changed_by: string | null
          event_id: string
          field_name: string
          id: number
          new_value: string | null
          previous_value: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          event_id: string
          field_name: string
          id?: never
          new_value?: string | null
          previous_value?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          event_id?: string
          field_name?: string
          id?: never
          new_value?: string | null
          previous_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_field_changes_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_field_changes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registration_requirements: {
        Row: {
          attendee_capacity: number | null
          event_id: string
          registration_closes_at: string | null
          registration_opens_at: string | null
          registration_required: boolean
          waitlist_enabled: boolean
        }
        Insert: {
          attendee_capacity?: number | null
          event_id: string
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          registration_required?: boolean
          waitlist_enabled?: boolean
        }
        Update: {
          attendee_capacity?: number | null
          event_id?: string
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          registration_required?: boolean
          waitlist_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_registration_requirements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          attendee_id: string
          event_id: string
          id: string
          registered_at: string
          status: string
          withdrawn_at: string | null
        }
        Insert: {
          attendee_id: string
          event_id: string
          id?: string
          registered_at?: string
          status?: string
          withdrawn_at?: string | null
        }
        Update: {
          attendee_id?: string
          event_id?: string
          id?: string
          registered_at?: string
          status?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_required_facilities: {
        Row: {
          event_id: string
          facility_name: string
          id: string
          notes: string | null
        }
        Insert: {
          event_id: string
          facility_name: string
          id?: string
          notes?: string | null
        }
        Update: {
          event_id?: string
          facility_name?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_required_facilities_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_safety_check_submissions: {
        Row: {
          attendance_snapshot: number | null
          coordinator_id: string
          equipment_snapshot: Json
          event_id: string
          id: number
          period_snapshot: Json
          round: number
          submitted_at: string
          venues_snapshot: Json
        }
        Insert: {
          attendance_snapshot?: number | null
          coordinator_id: string
          equipment_snapshot: Json
          event_id: string
          id?: never
          period_snapshot: Json
          round: number
          submitted_at?: string
          venues_snapshot: Json
        }
        Update: {
          attendance_snapshot?: number | null
          coordinator_id?: string
          equipment_snapshot?: Json
          event_id?: string
          id?: never
          period_snapshot?: Json
          round?: number
          submitted_at?: string
          venues_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "event_safety_check_submissions_coordinator_id_fkey"
            columns: ["coordinator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_safety_check_submissions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          event_id: string
          from_status: Database["public"]["Enums"]["event_status"] | null
          id: number
          reason: string | null
          to_status: Database["public"]["Enums"]["event_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          event_id: string
          from_status?: Database["public"]["Enums"]["event_status"] | null
          id?: never
          reason?: string | null
          to_status: Database["public"]["Enums"]["event_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          event_id?: string
          from_status?: Database["public"]["Enums"]["event_status"] | null
          id?: never
          reason?: string | null
          to_status?: Database["public"]["Enums"]["event_status"]
        }
        Relationships: [
          {
            foreignKeyName: "event_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_status_history_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_venue_requirements: {
        Row: {
          accessibility_notes: string | null
          event_id: string
          layout_notes: string | null
          minimum_capacity: number | null
          preferred_location: string | null
          updated_at: string
        }
        Insert: {
          accessibility_notes?: string | null
          event_id: string
          layout_notes?: string | null
          minimum_capacity?: number | null
          preferred_location?: string | null
          updated_at?: string
        }
        Update: {
          accessibility_notes?: string | null
          event_id?: string
          layout_notes?: string | null
          minimum_capacity?: number | null
          preferred_location?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_venue_requirements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          assigned_coordinator_id: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          event_type: string | null
          expected_attendance: number | null
          id: string
          organiser_id: string
          purpose: string | null
          requirements_acknowledged: boolean
          starts_at: string | null
          status: Database["public"]["Enums"]["event_status"]
          submitted_at: string | null
          submitted_by: string | null
          title: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          assigned_coordinator_id?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string | null
          expected_attendance?: number | null
          id?: string
          organiser_id: string
          purpose?: string | null
          requirements_acknowledged?: boolean
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          title: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          assigned_coordinator_id?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string | null
          expected_attendance?: number | null
          id?: string
          organiser_id?: string
          purpose?: string | null
          requirements_acknowledged?: boolean
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_assigned_coordinator_id_fkey"
            columns: ["assigned_coordinator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          booking_id: string | null
          created_at: string
          event_id: string | null
          id: string
          message: string
          read_at: string | null
          recipient_id: string
          scheduled_for: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          message: string
          read_at?: string | null
          recipient_id: string
          scheduled_for?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          message?: string
          read_at?: string | null
          recipient_id?: string
          scheduled_for?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "venue_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      venue_area_options: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      venue_booking_conflicts: {
        Row: {
          booking_id: string
          cause: string
          conflicting_block_id: string | null
          conflicting_booking_id: string | null
          flagged_at: string
          flagged_by: string | null
          id: number
          is_responsible: boolean
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          booking_id: string
          cause: string
          conflicting_block_id?: string | null
          conflicting_booking_id?: string | null
          flagged_at?: string
          flagged_by?: string | null
          id?: never
          is_responsible?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          booking_id?: string
          cause?: string
          conflicting_block_id?: string | null
          conflicting_booking_id?: string | null
          flagged_at?: string
          flagged_by?: string | null
          id?: never
          is_responsible?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_booking_conflicts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "venue_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_booking_conflicts_conflicting_block_id_fkey"
            columns: ["conflicting_block_id"]
            isOneToOne: false
            referencedRelation: "venue_unavailability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_booking_conflicts_conflicting_booking_id_fkey"
            columns: ["conflicting_booking_id"]
            isOneToOne: false
            referencedRelation: "venue_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_booking_conflicts_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_booking_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_booking_disruptions: {
        Row: {
          block_id: string
          booking_id: string
          cleared_at: string | null
          cleared_by: string | null
          flagged_at: string
          flagged_by: string | null
          id: string
        }
        Insert: {
          block_id: string
          booking_id: string
          cleared_at?: string | null
          cleared_by?: string | null
          flagged_at?: string
          flagged_by?: string | null
          id?: string
        }
        Update: {
          block_id?: string
          booking_id?: string
          cleared_at?: string | null
          cleared_by?: string | null
          flagged_at?: string
          flagged_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_booking_disruptions_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "venue_unavailability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_booking_disruptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "venue_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_booking_disruptions_cleared_by_fkey"
            columns: ["cleared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_booking_disruptions_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_bookings: {
        Row: {
          accessibility_notes: string | null
          advisory_notes: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          ends_at: string
          event_id: string
          expected_headcount: number | null
          expires_at: string | null
          held_by: string | null
          id: string
          is_main_venue: boolean
          label: string
          layout_notes: string | null
          main_designated_at: string | null
          needs_review: boolean
          needs_review_reason: string | null
          replaces_booking_id: string | null
          requested_at: string
          requested_by: string
          required_facilities: string[]
          starts_at: string
          status: Database["public"]["Enums"]["request_status"]
          venue_id: string
        }
        Insert: {
          accessibility_notes?: string | null
          advisory_notes?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          ends_at: string
          event_id: string
          expected_headcount?: number | null
          expires_at?: string | null
          held_by?: string | null
          id?: string
          is_main_venue?: boolean
          label?: string
          layout_notes?: string | null
          main_designated_at?: string | null
          needs_review?: boolean
          needs_review_reason?: string | null
          replaces_booking_id?: string | null
          requested_at?: string
          requested_by: string
          required_facilities?: string[]
          starts_at: string
          status?: Database["public"]["Enums"]["request_status"]
          venue_id: string
        }
        Update: {
          accessibility_notes?: string | null
          advisory_notes?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          ends_at?: string
          event_id?: string
          expected_headcount?: number | null
          expires_at?: string | null
          held_by?: string | null
          id?: string
          is_main_venue?: boolean
          label?: string
          layout_notes?: string | null
          main_designated_at?: string | null
          needs_review?: boolean
          needs_review_reason?: string | null
          replaces_booking_id?: string | null
          requested_at?: string
          requested_by?: string
          required_facilities?: string[]
          starts_at?: string
          status?: Database["public"]["Enums"]["request_status"]
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_bookings_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_bookings_held_by_fkey"
            columns: ["held_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_bookings_replaces_booking_id_fkey"
            columns: ["replaces_booking_id"]
            isOneToOne: false
            referencedRelation: "venue_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_bookings_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_buffer_time_changes: {
        Row: {
          changed_at: string
          changed_by: string | null
          field_name: string
          id: number
          new_value: number
          previous_value: number
          venue_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field_name: string
          id?: never
          new_value: number
          previous_value: number
          venue_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field_name?: string
          id?: never
          new_value?: number
          previous_value?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_buffer_time_changes_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_buffer_time_changes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_facilities: {
        Row: {
          facility_name: string
          id: string
          venue_id: string
        }
        Insert: {
          facility_name: string
          id?: string
          venue_id: string
        }
        Update: {
          facility_name?: string
          id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_facilities_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_layouts: {
        Row: {
          id: string
          layout_name: string
          max_capacity: number | null
          venue_id: string
        }
        Insert: {
          id?: string
          layout_name: string
          max_capacity?: number | null
          venue_id: string
        }
        Update: {
          id?: string
          layout_name?: string
          max_capacity?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_layouts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_unavailability: {
        Row: {
          ends_at: string
          id: string
          reason: string | null
          reason_category: Database["public"]["Enums"]["venue_block_reason_category"]
          removed_at: string | null
          removed_by: string | null
          starts_at: string
          venue_id: string
        }
        Insert: {
          ends_at: string
          id?: string
          reason?: string | null
          reason_category?: Database["public"]["Enums"]["venue_block_reason_category"]
          removed_at?: string | null
          removed_by?: string | null
          starts_at: string
          venue_id: string
        }
        Update: {
          ends_at?: string
          id?: string
          reason?: string | null
          reason_category?: Database["public"]["Enums"]["venue_block_reason_category"]
          removed_at?: string | null
          removed_by?: string | null
          starts_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_unavailability_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_unavailability_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          accessibility_notes: string | null
          area_tags: string[]
          capacity: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          location: string
          name: string
          operating_hours: Json
          setup_time_minutes: number
          turnaround_time_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accessibility_notes?: string | null
          area_tags?: string[]
          capacity: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          location: string
          name: string
          operating_hours?: Json
          setup_time_minutes?: number
          turnaround_time_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accessibility_notes?: string | null
          area_tags?: string[]
          capacity?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          location?: string
          name?: string
          operating_hours?: Json
          setup_time_minutes?: number
          turnaround_time_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_equipment_units: {
        Args: { p_count: number; p_item_id: string }
        Returns: number
      }
      assert_technical_support_staff: { Args: never; Returns: undefined }
      can_view_event: { Args: { target_event_id: string }; Returns: boolean }
      cancel_event: {
        Args: { p_actor_id?: string; p_event_id: string; p_reason: string }
        Returns: Json
      }
      cancel_event_request: {
        Args: { p_actor_id?: string; p_event_id: string }
        Returns: Json
      }
      change_equipment_reservation: {
        Args: { p_quantity: number; p_reservation_id: string }
        Returns: string
      }
      check_event_equipment_availability: {
        Args: { p_event_ids: string[] }
        Returns: {
          available_quantity: number
          equipment_item_id: string
          equipment_name: string
          event_id: string
          item_code: string
          item_retired: boolean
          requested_quantity: number
          required_from: string
          required_until: string
          requirement_id: string
          reservation_id: string
          reservation_needs_recheck: boolean
          reservation_quantity: number
          reservation_recheck_reason: string
          reserved_at: string
          reserved_by_name: string
          reserved_quantity: number
          status: string
          technical_requirements: string
          total_units: number
          unavailable_quantity: number
        }[]
      }
      check_venue_booking_availability: {
        Args: {
          p_ends_at?: string
          p_event_id: string
          p_exclude_booking_id?: string
          p_starts_at?: string
          p_venue_id: string
        }
        Returns: Json
      }
      clean_equipment_item_fields: {
        Args: {
          p_category: string
          p_code: string
          p_item_id: string
          p_name: string
        }
        Returns: Record<string, unknown>
      }
      clear_block_disruptions: {
        Args: { p_block_id: string; p_block_removed: boolean }
        Returns: number
      }
      complete_event: { Args: { p_event_id: string }; Returns: Json }
      confirm_venue_booking_hold: {
        Args: { p_actor_id?: string; p_booking_id: string }
        Returns: Json
      }
      create_equipment_item: {
        Args: {
          p_category: string
          p_code: string
          p_name: string
          p_units: number
        }
        Returns: string
      }
      create_venue: {
        Args: { p_actor_id?: string; p_venue: Json }
        Returns: Json
      }
      create_venue_block: {
        Args: {
          p_ends_at: string
          p_reason: string
          p_reason_category?: Database["public"]["Enums"]["venue_block_reason_category"]
          p_starts_at: string
          p_venue_id: string
        }
        Returns: Json
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      decide_event_request: {
        Args: {
          p_actor_id?: string
          p_decision: Database["public"]["Enums"]["event_decision_type"]
          p_event_id: string
          p_rationale: string
        }
        Returns: Json
      }
      decide_venue_booking_request: {
        Args: {
          p_actor_id?: string
          p_booking_id: string
          p_decision: Database["public"]["Enums"]["venue_booking_decision_type"]
          p_reason?: string
        }
        Returns: Json
      }
      end_equipment_unavailability: {
        Args: { p_unavailability_id: string }
        Returns: string
      }
      equipment_commitment_peaks: {
        Args: {
          p_exclude_requirement_id?: string
          p_from: string
          p_item_id: string
          p_until: string
        }
        Returns: {
          peak_all: number
          peak_reserved: number
          peak_unavailable: number
        }[]
      }
      event_equipment_snapshot: {
        Args: {
          requirement: Database["public"]["Tables"]["event_equipment_requirements"]["Row"]
        }
        Returns: Json
      }
      event_has_unresolved_clarification: {
        Args: { p_event_id: string }
        Returns: boolean
      }
      event_planning_allowed: { Args: { p_event_id: string }; Returns: boolean }
      event_readiness: { Args: { p_event_id: string }; Returns: Json }
      event_status_transition_allowed: {
        Args: {
          from_status: Database["public"]["Enums"]["event_status"]
          to_status: Database["public"]["Enums"]["event_status"]
        }
        Returns: boolean
      }
      expire_stale_event_hold: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      expire_stale_venue_holds: {
        Args: { p_venue_id: string }
        Returns: undefined
      }
      find_matching_venues: {
        Args: { p_event_id: string }
        Returns: {
          accessibility_notes: string
          availability_status: string
          capacity: number
          description: string
          facilities: string[]
          id: string
          location: string
          name: string
          operating_hours: Json
          setup_time_minutes: number
          turnaround_time_minutes: number
          updated_at: string
        }[]
      }
      flag_equipment_reservations: {
        Args: { p_reason: string; p_reservation_ids: string[] }
        Returns: undefined
      }
      format_sg_time: { Args: { p_at: string }; Returns: string }
      list_auto_event_coordinator_reassignments: {
        Args: { p_event_id: string }
        Returns: {
          changed_at: string
          id: number
          new_coordinator_id: string
          new_coordinator_name: string
          previous_coordinator_id: string
          previous_coordinator_name: string
          reason: string
        }[]
      }
      list_event_coordinator_history: {
        Args: { p_event_id: string }
        Returns: {
          changed_at: string
          changed_by_id: string
          changed_by_name: string
          ended_at: string
          id: number
          new_coordinator_id: string
          new_coordinator_name: string
          previous_coordinator_id: string
          previous_coordinator_name: string
          reason: string
        }[]
      }
      lock_requirement_for_reservation: {
        Args: { p_requirement_id: string }
        Returns: Record<string, unknown>
      }
      place_venue_booking_hold: {
        Args: {
          p_actor_id?: string
          p_booking_id: string
          p_expires_at: string
        }
        Returns: Json
      }
      preview_venue_block_impact: {
        Args: { p_ends_at: string; p_starts_at: string; p_venue_id: string }
        Returns: {
          booking_id: string
          coordinator_id: string
          coordinator_name: string
          ends_at: string
          event_id: string
          event_title: string
          starts_at: string
          status: Database["public"]["Enums"]["request_status"]
          venue_name: string
        }[]
      }
      reassign_event_coordinator: {
        Args: {
          p_actor_id?: string
          p_event_id: string
          p_new_coordinator_id: string
          p_reason: string
        }
        Returns: Json
      }
      recheck_all_venue_conflicts: {
        Args: { p_actor_id?: string }
        Returns: Json
      }
      recheck_venue_conflicts: {
        Args: { p_actor_id?: string; p_venue_id: string }
        Returns: Json
      }
      record_equipment_unavailability: {
        Args: {
          p_ends_at: string
          p_equipment_item_id: string
          p_quantity: number
          p_reason: string
          p_starts_at: string
          p_unit_ids?: string[]
        }
        Returns: string
      }
      release_equipment_reservation: {
        Args: { p_reason?: string; p_reservation_id: string }
        Returns: string
      }
      release_reservations_for_ended_event: {
        Args: { p_event_id: string; p_reason: string }
        Returns: undefined
      }
      remove_equipment_unavailability: {
        Args: { p_unavailability_id: string }
        Returns: string
      }
      remove_venue_block: { Args: { p_block_id: string }; Returns: string }
      request_event_clarification: {
        Args: {
          p_actor_id?: string
          p_event_id: string
          p_permitted_fields?: string[]
          p_question: string
        }
        Returns: Json
      }
      request_replacement_venue: {
        Args: { p_actor_id?: string; p_booking_id: string; p_venue_id: string }
        Returns: string
      }
      reservation_snapshot: {
        Args: {
          p_reservation: Database["public"]["Tables"]["equipment_reservations"]["Row"]
        }
        Returns: Json
      }
      reserve_equipment: {
        Args: { p_quantity: number; p_requirement_id: string }
        Returns: string
      }
      resolve_event_clarification: {
        Args: { p_actor_id?: string; p_clarification_id: string }
        Returns: Json
      }
      respond_event_clarification: {
        Args: {
          p_actor_id?: string
          p_clarification_id: string
          p_response: string
        }
        Returns: Json
      }
      save_event_draft: {
        Args: { draft: Json; target_event_id?: string }
        Returns: string
      }
      save_event_equipment_requirements: {
        Args: { p_equipment: Json; p_event_id: string }
        Returns: number
      }
      search_available_venues: {
        Args: {
          p_accessibility?: string
          p_ends_at: string
          p_event_id: string
          p_facilities?: string[]
          p_layout?: string
          p_location?: string
          p_min_capacity: number
          p_starts_at: string
        }
        Returns: {
          accessibility_notes: string
          capacity: number
          description: string
          facilities: string[]
          id: string
          layouts: string[]
          location: string
          name: string
          operating_hours: Json
          setup_time_minutes: number
          turnaround_time_minutes: number
          updated_at: string
        }[]
      }
      set_equipment_item_retired: {
        Args: { p_item_id: string; p_retired: boolean }
        Returns: string
      }
      set_equipment_unit_retired: {
        Args: { p_retired: boolean; p_unit_id: string }
        Returns: string
      }
      set_main_venue_booking: {
        Args: { p_actor_id?: string; p_booking_id: string }
        Returns: string
      }
      submit_event_for_safety_check: {
        Args: { p_actor_id?: string; p_event_id: string }
        Returns: Json
      }
      submit_event_request: {
        Args: { p_actor_id?: string; p_event_id: string }
        Returns: Json
      }
      submit_venue_booking_request: {
        Args: {
          p_accessibility_notes?: string
          p_actor_id?: string
          p_ends_at?: string
          p_event_id: string
          p_expected_headcount?: number
          p_label?: string
          p_layout_notes?: string
          p_required_facilities?: string[]
          p_starts_at?: string
          p_venue_id: string
        }
        Returns: string
      }
      update_equipment_arrangement: {
        Args: { p_note?: string; p_requirement_id: string; p_status: string }
        Returns: number
      }
      update_equipment_item: {
        Args: {
          p_category: string
          p_code: string
          p_item_id: string
          p_name: string
        }
        Returns: string
      }
      update_event_as_coordinator: {
        Args: { p_event_id: string; updates: Json }
        Returns: string
      }
      update_venue: {
        Args: { p_actor_id?: string; p_venue: Json; p_venue_id: string }
        Returns: Json
      }
      update_venue_block: {
        Args: { p_block_id: string; p_ends_at: string; p_starts_at: string }
        Returns: Json
      }
      validate_operating_hours: {
        Args: { p_operating_hours: Json }
        Returns: string
      }
      venue_block_affected_bookings: {
        Args: { p_ends_at: string; p_starts_at: string; p_venue_id: string }
        Returns: {
          booking_id: string
          coordinator_id: string
          coordinator_name: string
          ends_at: string
          event_id: string
          event_title: string
          starts_at: string
          status: Database["public"]["Enums"]["request_status"]
          venue_name: string
        }[]
      }
      venue_booking_fits_operating_hours: {
        Args: { p_ends_at: string; p_starts_at: string; p_venue_id: string }
        Returns: boolean
      }
      venue_effective_window: {
        Args: { p_ends_at: string; p_starts_at: string; p_venue_id: string }
        Returns: unknown
      }
      venue_matches_area: {
        Args: { p_address: string; p_requested: string; p_tags: string[] }
        Returns: boolean
      }
      withdraw_venue_booking_request: {
        Args: { p_actor_id?: string; p_booking_id: string; p_reason?: string }
        Returns: string
      }
    }
    Enums: {
      clarification_status: "open" | "answered" | "resolved"
      event_decision_type: "approved" | "rejected"
      event_status:
        | "draft"
        | "requested"
        | "submitted"
        | "clarification_requested"
        | "under_review"
        | "planning"
        | "pending_safety_check"
        | "approved"
        | "rejected"
        | "confirmed"
        | "completed"
        | "cancelled"
      notification_type:
        | "assignment"
        | "clarification"
        | "decision"
        | "status_change"
        | "venue_decision"
        | "event_change"
        | "registration_update"
        | "confirmation"
        | "cancellation"
        | "venue_capacity_review"
        | "venue_request"
        | "venue_hold_expiring_soon"
        | "venue_hold_expired"
        | "venue_hold_placed"
        | "venue_hold_confirmed"
        | "venue_request_withdrawn"
        | "venue_conflict_flagged"
        | "venue_conflict_resolved"
        | "venue_booking_disrupted"
        | "venue_disruption_cleared"
        | "safety_check_requested"
      request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "on_hold"
        | "expired"
      room_layout:
        | "Theatre"
        | "Classroom"
        | "Boardroom"
        | "Banquet"
        | "Open Floor"
        | "Auditorium"
        | "Exhibition"
      user_role:
        | "event_organiser"
        | "event_coordinator"
        | "venue_staff"
        | "technical_support_staff"
        | "attendee"
        | "event_coordinator_lead"
        | "safety_officer"
      venue_block_reason_category:
        | "maintenance"
        | "equipment_failure"
        | "renovation"
        | "safety"
        | "other"
      venue_booking_decision_type: "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      clarification_status: ["open", "answered", "resolved"],
      event_decision_type: ["approved", "rejected"],
      event_status: [
        "draft",
        "requested",
        "submitted",
        "clarification_requested",
        "under_review",
        "planning",
        "pending_safety_check",
        "approved",
        "rejected",
        "confirmed",
        "completed",
        "cancelled",
      ],
      notification_type: [
        "assignment",
        "clarification",
        "decision",
        "status_change",
        "venue_decision",
        "event_change",
        "registration_update",
        "confirmation",
        "cancellation",
        "venue_capacity_review",
        "venue_request",
        "venue_hold_expiring_soon",
        "venue_hold_expired",
        "venue_hold_placed",
        "venue_hold_confirmed",
        "venue_request_withdrawn",
        "venue_conflict_flagged",
        "venue_conflict_resolved",
        "venue_booking_disrupted",
        "venue_disruption_cleared",
        "safety_check_requested",
      ],
      request_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "on_hold",
        "expired",
      ],
      room_layout: [
        "Theatre",
        "Classroom",
        "Boardroom",
        "Banquet",
        "Open Floor",
        "Auditorium",
        "Exhibition",
      ],
      user_role: [
        "event_organiser",
        "event_coordinator",
        "venue_staff",
        "technical_support_staff",
        "attendee",
        "event_coordinator_lead",
        "safety_officer",
      ],
      venue_block_reason_category: [
        "maintenance",
        "equipment_failure",
        "renovation",
        "safety",
        "other",
      ],
      venue_booking_decision_type: ["approved", "rejected"],
    },
  },
} as const
