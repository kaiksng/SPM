export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      equipment_items: {
        Row: {
          category: string | null
          id: string
          name: string
          notes: string | null
          total_quantity: number
        }
        Insert: {
          category?: string | null
          id?: string
          name: string
          notes?: string | null
          total_quantity: number
        }
        Update: {
          category?: string | null
          id?: string
          name?: string
          notes?: string | null
          total_quantity?: number
        }
        Relationships: []
      }
      equipment_reservations: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          ends_at: string
          equipment_item_id: string
          event_id: string
          id: string
          quantity: number
          requested_at: string
          requested_by: string
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
          quantity: number
          requested_at?: string
          requested_by: string
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
          quantity?: number
          requested_at?: string
          requested_by?: string
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
            foreignKeyName: "equipment_reservations_requested_by_fkey"
            columns: ["requested_by"]
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
      event_equipment_requirements: {
        Row: {
          equipment_name: string
          event_id: string
          id: string
          notes: string | null
          quantity: number
        }
        Insert: {
          equipment_name: string
          event_id: string
          id?: string
          notes?: string | null
          quantity?: number
        }
        Update: {
          equipment_name?: string
          event_id?: string
          id?: string
          notes?: string | null
          quantity?: number
        }
        Relationships: [
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
          created_at: string
          event_id: string | null
          id: string
          message: string
          read_at: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          message: string
          read_at?: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          message?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
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
      venue_bookings: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          ends_at: string
          event_id: string
          id: string
          needs_review: boolean
          needs_review_reason: string | null
          requested_at: string
          requested_by: string
          starts_at: string
          status: Database["public"]["Enums"]["request_status"]
          venue_id: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          ends_at: string
          event_id: string
          id?: string
          needs_review?: boolean
          needs_review_reason?: string | null
          requested_at?: string
          requested_by: string
          starts_at: string
          status?: Database["public"]["Enums"]["request_status"]
          venue_id: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          ends_at?: string
          event_id?: string
          id?: string
          needs_review?: boolean
          needs_review_reason?: string | null
          requested_at?: string
          requested_by?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["request_status"]
          venue_id?: string
        }
        Relationships: [
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
          layout_name: Database["public"]["Enums"]["room_layout"]
          max_capacity: number | null
          venue_id: string
        }
        Insert: {
          id?: string
          layout_name: Database["public"]["Enums"]["room_layout"]
          max_capacity?: number | null
          venue_id: string
        }
        Update: {
          id?: string
          layout_name?: Database["public"]["Enums"]["room_layout"]
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
          removed_at: string | null
          removed_by: string | null
          starts_at: string
          venue_id: string
        }
        Insert: {
          ends_at: string
          id?: string
          reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          starts_at: string
          venue_id: string
        }
        Update: {
          ends_at?: string
          id?: string
          reason?: string | null
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
          capacity: number
          created_at: string
          description: string | null
          id: string
          location: string
          name: string
          operating_hours: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accessibility_notes?: string | null
          capacity: number
          created_at?: string
          description?: string | null
          id?: string
          location: string
          name: string
          operating_hours?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accessibility_notes?: string | null
          capacity?: number
          created_at?: string
          description?: string | null
          id?: string
          location?: string
          name?: string
          operating_hours?: Json
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
      assign_event_coordinator: {
        Args: { p_event_id: string }
        Returns: string
      }
      can_view_event: { Args: { target_event_id: string }; Returns: boolean }
      cancel_event_request: {
        Args: { p_actor_id?: string; p_event_id: string }
        Returns: Json
      }
      complete_event: { Args: { p_event_id: string }; Returns: Json }
      create_venue: {
        Args: { p_actor_id?: string; p_venue: Json }
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
      event_has_unresolved_clarification: {
        Args: { p_event_id: string }
        Returns: boolean
      }
      event_planning_allowed: { Args: { p_event_id: string }; Returns: boolean }
      event_status_transition_allowed: {
        Args: {
          from_status: Database["public"]["Enums"]["event_status"]
          to_status: Database["public"]["Enums"]["event_status"]
        }
        Returns: boolean
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
          updated_at: string
        }[]
      }
      create_venue_block: {
        Args: { p_venue_id: string; p_reason: string; p_starts_at: string; p_ends_at: string }
        Returns: string
      }
      remove_venue_block: {
        Args: { p_block_id: string }
        Returns: string
      }
      search_available_venues: {
        Args: {
          p_event_id: string
          p_starts_at: string
          p_ends_at: string
          p_min_capacity: number
          p_location?: string | null
          p_layout?: string | null
          p_facilities?: string[]
          p_accessibility?: string | null
        }
        Returns: {
          id: string
          name: string
          location: string
          capacity: number
          operating_hours: Json
          description: string | null
          accessibility_notes: string | null
          updated_at: string
          facilities: string[]
          layouts: string[]
        }[]
      }
      request_event_clarification: {
        Args: {
          p_actor_id?: string
          p_event_id: string
          p_permitted_fields?: string[]
          p_question: string
        }
        Returns: Json
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
      submit_event_request: {
        Args: { p_actor_id?: string; p_event_id: string }
        Returns: Json
      }
      submit_venue_booking_request: {
        Args: { p_event_id: string; p_venue_id: string }
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
      validate_operating_hours: {
        Args: { p_operating_hours: Json }
        Returns: string
      }
      venue_booking_fits_operating_hours: {
        Args: { p_ends_at: string; p_starts_at: string; p_venue_id: string }
        Returns: boolean
      }
      withdraw_venue_booking_request: {
        Args: { p_booking_id: string }
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
      request_status: "pending" | "approved" | "rejected" | "cancelled"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      ],
      request_status: ["pending", "approved", "rejected", "cancelled"],
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
      ],
      venue_booking_decision_type: ["approved", "rejected"],
    },
  },
} as const
