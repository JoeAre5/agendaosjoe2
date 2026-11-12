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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acuity_operator_log: {
        Row: {
          action: string
          acuity_id: number | null
          barber_id: string | null
          barber_name: string | null
          created_at: string
          id: string
          method: string | null
          path: string | null
          role: string | null
          status_code: number | null
          target_calendar_id: number | null
          target_datetime: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          action: string
          acuity_id?: number | null
          barber_id?: string | null
          barber_name?: string | null
          created_at?: string
          id?: string
          method?: string | null
          path?: string | null
          role?: string | null
          status_code?: number | null
          target_calendar_id?: number | null
          target_datetime?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          action?: string
          acuity_id?: number | null
          barber_id?: string | null
          barber_name?: string | null
          created_at?: string
          id?: string
          method?: string | null
          path?: string | null
          role?: string | null
          status_code?: number | null
          target_calendar_id?: number | null
          target_datetime?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      acuity_sync_conflicts: {
        Row: {
          acuity_id: number
          alert_sent_at: string | null
          conflict_reason: string
          detected_at: string
          id: string
          payload: Json
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          shop_id: string | null
          source: string
          status: string
        }
        Insert: {
          acuity_id: number
          alert_sent_at?: string | null
          conflict_reason: string
          detected_at?: string
          id?: string
          payload: Json
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shop_id?: string | null
          source: string
          status?: string
        }
        Update: {
          acuity_id?: number
          alert_sent_at?: string | null
          conflict_reason?: string
          detected_at?: string
          id?: string
          payload?: Json
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shop_id?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "acuity_sync_conflicts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      acuity_webhook_log: {
        Row: {
          acuity_appointment_id: number | null
          confidence_score: number
          error_message: string | null
          event_type: string
          id: string
          mapped_protocol: string | null
          parsed_action: string | null
          processing_ms: number | null
          raw_payload: Json
          received_at: string
          shop_id: string | null
        }
        Insert: {
          acuity_appointment_id?: number | null
          confidence_score?: number
          error_message?: string | null
          event_type?: string
          id?: string
          mapped_protocol?: string | null
          parsed_action?: string | null
          processing_ms?: number | null
          raw_payload?: Json
          received_at?: string
          shop_id?: string | null
        }
        Update: {
          acuity_appointment_id?: number | null
          confidence_score?: number
          error_message?: string | null
          event_type?: string
          id?: string
          mapped_protocol?: string | null
          parsed_action?: string | null
          processing_ms?: number | null
          raw_payload?: Json
          received_at?: string
          shop_id?: string | null
        }
        Relationships: []
      }
      admin_notification_prefs: {
        Row: {
          group_similar: boolean
          group_window_minutes: number
          id: boolean
          quiet_end: string
          quiet_hours_enabled: boolean
          quiet_start: string
          shop_id: string | null
          sound_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          group_similar?: boolean
          group_window_minutes?: number
          id?: boolean
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          shop_id?: string | null
          sound_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          group_similar?: boolean
          group_window_minutes?: number
          id?: boolean
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          shop_id?: string | null
          sound_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notification_prefs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notification_rules: {
        Row: {
          body_en: string
          body_es: string
          category: string
          description_en: string | null
          description_es: string | null
          event_key: string
          is_enabled: boolean
          shop_id: string | null
          title_en: string
          title_es: string
          updated_at: string
          updated_by: string | null
          url_path: string | null
        }
        Insert: {
          body_en: string
          body_es: string
          category?: string
          description_en?: string | null
          description_es?: string | null
          event_key: string
          is_enabled?: boolean
          shop_id?: string | null
          title_en: string
          title_es: string
          updated_at?: string
          updated_by?: string | null
          url_path?: string | null
        }
        Update: {
          body_en?: string
          body_es?: string
          category?: string
          description_en?: string | null
          description_es?: string | null
          event_key?: string
          is_enabled?: boolean
          shop_id?: string | null
          title_en?: string
          title_es?: string
          updated_at?: string
          updated_by?: string | null
          url_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notification_rules_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      app_flags: {
        Row: {
          id: boolean
          public_site_live: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          public_site_live?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          public_site_live?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      appointment_overlap_overrides: {
        Row: {
          appointment_id: string
          authorized_by: string | null
          created_at: string
          id: string
          reason: string
        }
        Insert: {
          appointment_id: string
          authorized_by?: string | null
          created_at?: string
          id?: string
          reason: string
        }
        Update: {
          appointment_id?: string
          authorized_by?: string | null
          created_at?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_overlap_overrides_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_overlap_preauth: {
        Row: {
          acuity_id: number
          authorized_by: string | null
          authorized_role: string | null
          created_at: string
          reason: string
        }
        Insert: {
          acuity_id: number
          authorized_by?: string | null
          authorized_role?: string | null
          created_at?: string
          reason: string
        }
        Update: {
          acuity_id?: number
          authorized_by?: string | null
          authorized_role?: string | null
          created_at?: string
          reason?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          acuity_client_id: number | null
          acuity_id: number | null
          addons: string[] | null
          amount_paid_cents: number
          applied_benefit_redemption_id: string | null
          barber_id: string
          benefit_discount_cents: number
          booked_for_member_id: string | null
          booking_source: string
          cancelled_at: string | null
          cancelled_by_role: string | null
          certificate_code: string | null
          client_email: string | null
          client_id: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          created_by_role: string | null
          created_by_user_id: string | null
          duplicate_dismissed_at: string | null
          duplicate_dismissed_by: string | null
          duplicate_dismissed_reason: string | null
          duration_minutes: number
          edit_line_items: Json | null
          ends_at: string
          form_responses: string | null
          id: string
          is_recurring: boolean
          is_rewards_eligible: boolean
          label: string | null
          last_pushed_at: string | null
          notes: string | null
          overlap_exempt: boolean
          paid: boolean
          payment_confirmed: boolean
          payment_method: string | null
          payment_reference_id: string | null
          price_cents: number
          price_sold_cents: number | null
          recurring_group_id: string | null
          referral_attribution_code: string | null
          refund_status: string | null
          reward_eligibility_reason: string | null
          service_id: number | null
          service_name: string
          shop_id: string | null
          starts_at: string
          status: string
          stripe_payment_method_type: string | null
          tip_cents: number
          updated_at: string
        }
        Insert: {
          acuity_client_id?: number | null
          acuity_id?: number | null
          addons?: string[] | null
          amount_paid_cents?: number
          applied_benefit_redemption_id?: string | null
          barber_id: string
          benefit_discount_cents?: number
          booked_for_member_id?: string | null
          booking_source?: string
          cancelled_at?: string | null
          cancelled_by_role?: string | null
          certificate_code?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string
          created_by_role?: string | null
          created_by_user_id?: string | null
          duplicate_dismissed_at?: string | null
          duplicate_dismissed_by?: string | null
          duplicate_dismissed_reason?: string | null
          duration_minutes: number
          edit_line_items?: Json | null
          ends_at: string
          form_responses?: string | null
          id?: string
          is_recurring?: boolean
          is_rewards_eligible?: boolean
          label?: string | null
          last_pushed_at?: string | null
          notes?: string | null
          overlap_exempt?: boolean
          paid?: boolean
          payment_confirmed?: boolean
          payment_method?: string | null
          payment_reference_id?: string | null
          price_cents: number
          price_sold_cents?: number | null
          recurring_group_id?: string | null
          referral_attribution_code?: string | null
          refund_status?: string | null
          reward_eligibility_reason?: string | null
          service_id?: number | null
          service_name: string
          shop_id?: string | null
          starts_at: string
          status?: string
          stripe_payment_method_type?: string | null
          tip_cents?: number
          updated_at?: string
        }
        Update: {
          acuity_client_id?: number | null
          acuity_id?: number | null
          addons?: string[] | null
          amount_paid_cents?: number
          applied_benefit_redemption_id?: string | null
          barber_id?: string
          benefit_discount_cents?: number
          booked_for_member_id?: string | null
          booking_source?: string
          cancelled_at?: string | null
          cancelled_by_role?: string | null
          certificate_code?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string
          created_by_role?: string | null
          created_by_user_id?: string | null
          duplicate_dismissed_at?: string | null
          duplicate_dismissed_by?: string | null
          duplicate_dismissed_reason?: string | null
          duration_minutes?: number
          edit_line_items?: Json | null
          ends_at?: string
          form_responses?: string | null
          id?: string
          is_recurring?: boolean
          is_rewards_eligible?: boolean
          label?: string | null
          last_pushed_at?: string | null
          notes?: string | null
          overlap_exempt?: boolean
          paid?: boolean
          payment_confirmed?: boolean
          payment_method?: string | null
          payment_reference_id?: string | null
          price_cents?: number
          price_sold_cents?: number | null
          recurring_group_id?: string | null
          referral_attribution_code?: string | null
          refund_status?: string | null
          reward_eligibility_reason?: string | null
          service_id?: number | null
          service_name?: string
          shop_id?: string | null
          starts_at?: string
          status?: string
          stripe_payment_method_type?: string | null
          tip_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_applied_benefit_redemption_id_fkey"
            columns: ["applied_benefit_redemption_id"]
            isOneToOne: false
            referencedRelation: "client_benefit_redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_appointments_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_appointments_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      athmovil_webhook_log: {
        Row: {
          auth_mode: string
          created_at: string
          event_status: string | null
          id: string
          outcome: string | null
          payload: Json | null
          received_at: string
          reference_number: string | null
          shop_id: string | null
          status_code: number | null
          total_cents: number | null
          verified: boolean
        }
        Insert: {
          auth_mode?: string
          created_at?: string
          event_status?: string | null
          id?: string
          outcome?: string | null
          payload?: Json | null
          received_at?: string
          reference_number?: string | null
          shop_id?: string | null
          status_code?: number | null
          total_cents?: number | null
          verified?: boolean
        }
        Update: {
          auth_mode?: string
          created_at?: string
          event_status?: string | null
          id?: string
          outcome?: string | null
          payload?: Json | null
          received_at?: string
          reference_number?: string | null
          shop_id?: string | null
          status_code?: number | null
          total_cents?: number | null
          verified?: boolean
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          shop_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          shop_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          shop_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      barber_payouts_paid: {
        Row: {
          amount_cents: number
          barber_name: string
          created_at: string
          created_by: string | null
          id: string
          method: string
          note: string | null
          paid_at: string
          shop_id: string | null
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          amount_cents: number
          barber_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          shop_id?: string | null
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          amount_cents?: number
          barber_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          shop_id?: string | null
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "barber_payouts_paid_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      barbers: {
        Row: {
          acuity_calendar_id: number | null
          acuity_calendar_key: string | null
          avatar_url: string | null
          bonus_threshold_cents: number
          color: string | null
          commission_rate: number | null
          created_at: string
          description: string | null
          draft_avatar_url: string | null
          draft_ig_photos: string[] | null
          email: string | null
          employee_id: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          id: string
          ig_photos: string[]
          is_active: boolean
          is_bookable: boolean
          is_default_checkout_barber: boolean
          name: string
          product_commission_rate: number | null
          retention_rate: number | null
          shop_id: string | null
          show_in_checkout: boolean
          social_facebook: string | null
          social_instagram: string | null
          social_tiktok: string | null
          ssn_last4: string | null
          timezone: string | null
          weekly_salary: number | null
        }
        Insert: {
          acuity_calendar_id?: number | null
          acuity_calendar_key?: string | null
          avatar_url?: string | null
          bonus_threshold_cents?: number
          color?: string | null
          commission_rate?: number | null
          created_at?: string
          description?: string | null
          draft_avatar_url?: string | null
          draft_ig_photos?: string[] | null
          email?: string | null
          employee_id?: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          id?: string
          ig_photos?: string[]
          is_active?: boolean
          is_bookable?: boolean
          is_default_checkout_barber?: boolean
          name: string
          product_commission_rate?: number | null
          retention_rate?: number | null
          shop_id?: string | null
          show_in_checkout?: boolean
          social_facebook?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          ssn_last4?: string | null
          timezone?: string | null
          weekly_salary?: number | null
        }
        Update: {
          acuity_calendar_id?: number | null
          acuity_calendar_key?: string | null
          avatar_url?: string | null
          bonus_threshold_cents?: number
          color?: string | null
          commission_rate?: number | null
          created_at?: string
          description?: string | null
          draft_avatar_url?: string | null
          draft_ig_photos?: string[] | null
          email?: string | null
          employee_id?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          id?: string
          ig_photos?: string[]
          is_active?: boolean
          is_bookable?: boolean
          is_default_checkout_barber?: boolean
          name?: string
          product_commission_rate?: number | null
          retention_rate?: number | null
          shop_id?: string | null
          show_in_checkout?: boolean
          social_facebook?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          ssn_last4?: string | null
          timezone?: string | null
          weekly_salary?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "barbers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      barbers_public: {
        Row: {
          acuity_calendar_id: number | null
          avatar_url: string | null
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          ig_photos: string[]
          is_active: boolean
          is_bookable: boolean
          is_default_checkout_barber: boolean | null
          name: string
          shop_id: string | null
          show_in_checkout: boolean | null
          social_facebook: string | null
          social_instagram: string | null
          social_tiktok: string | null
        }
        Insert: {
          acuity_calendar_id?: number | null
          avatar_url?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id: string
          ig_photos?: string[]
          is_active?: boolean
          is_bookable?: boolean
          is_default_checkout_barber?: boolean | null
          name: string
          shop_id?: string | null
          show_in_checkout?: boolean | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
        }
        Update: {
          acuity_calendar_id?: number | null
          avatar_url?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          ig_photos?: string[]
          is_active?: boolean
          is_bookable?: boolean
          is_default_checkout_barber?: boolean | null
          name?: string
          shop_id?: string | null
          show_in_checkout?: boolean | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barbers_public_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      block_times: {
        Row: {
          acuity_block_id: number | null
          barber_id: string
          created_at: string
          ends_at: string
          id: string
          is_all_day: boolean
          is_multi_day: boolean
          is_recurring: boolean
          last_pushed_at: string | null
          notes: string | null
          recurring_group_id: string | null
          shop_id: string | null
          starts_at: string
        }
        Insert: {
          acuity_block_id?: number | null
          barber_id: string
          created_at?: string
          ends_at: string
          id?: string
          is_all_day?: boolean
          is_multi_day?: boolean
          is_recurring?: boolean
          last_pushed_at?: string | null
          notes?: string | null
          recurring_group_id?: string | null
          shop_id?: string | null
          starts_at: string
        }
        Update: {
          acuity_block_id?: number | null
          barber_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          is_all_day?: boolean
          is_multi_day?: boolean
          is_recurring?: boolean
          last_pushed_at?: string | null
          notes?: string | null
          recurring_group_id?: string | null
          shop_id?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "block_times_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_times_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_analytics_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          language: string | null
          metadata: Json
          path: string | null
          post_id: string | null
          referrer: string | null
          scroll_depth: number | null
          session_id: string
          shop_id: string | null
          source: string | null
          time_on_page_ms: number | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          language?: string | null
          metadata?: Json
          path?: string | null
          post_id?: string | null
          referrer?: string | null
          scroll_depth?: number | null
          session_id: string
          shop_id?: string | null
          source?: string | null
          time_on_page_ms?: number | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          language?: string | null
          metadata?: Json
          path?: string | null
          post_id?: string | null
          referrer?: string | null
          scroll_depth?: number | null
          session_id?: string
          shop_id?: string | null
          source?: string | null
          time_on_page_ms?: number | null
        }
        Relationships: []
      }
      blog_categories: {
        Row: {
          accent_color: string | null
          created_at: string
          default_bg_preset: string | null
          default_icon: string | null
          is_active: boolean
          label_en: string
          label_es: string
          shop_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          default_bg_preset?: string | null
          default_icon?: string | null
          is_active?: boolean
          label_en: string
          label_es: string
          shop_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          default_bg_preset?: string | null
          default_icon?: string | null
          is_active?: boolean
          label_en?: string
          label_es?: string
          shop_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_categories_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          ai_generated: boolean | null
          ai_model: string | null
          ai_prompt: string | null
          author: string | null
          author_avatar_url: string | null
          author_role: string | null
          author_role_en: string | null
          author_role_es: string | null
          authoring_language: string
          body: string
          body_blocks: Json | null
          body_blocks_en: Json | null
          body_blocks_es: Json | null
          body_en: string | null
          body_en_is_auto: boolean
          body_es_is_auto: boolean
          category: string | null
          cover_bg_preset: string | null
          cover_icon: string | null
          cover_icon_auto_suggested: boolean | null
          cover_icon_secondary: string | null
          cover_image_url: string | null
          created_at: string | null
          excerpt: string | null
          excerpt_en: string | null
          excerpt_en_is_auto: boolean
          excerpt_es_is_auto: boolean
          id: string
          is_published: boolean | null
          last_viewed_at: string | null
          og_image_url: string | null
          published_at: string | null
          read_time_minutes: number | null
          reading_time_minutes: number | null
          reading_time_override: boolean | null
          scheduled_for: string | null
          sent_to_subscribers_at: string | null
          sent_to_subscribers_count: number
          seo_description: string | null
          seo_description_en: string | null
          seo_description_es: string | null
          seo_title: string | null
          seo_title_en: string | null
          seo_title_es: string | null
          shop_id: string | null
          slug: string
          slug_en: string | null
          snapshot_en: Json | null
          snapshot_es: Json | null
          status: string | null
          subtitle: string | null
          subtitle_en: string | null
          subtitle_es: string | null
          tags: string[] | null
          title: string
          title_en: string | null
          title_en_is_auto: boolean
          title_es_is_auto: boolean
          updated_at: string | null
          view_count: number | null
          word_count: number | null
        }
        Insert: {
          ai_generated?: boolean | null
          ai_model?: string | null
          ai_prompt?: string | null
          author?: string | null
          author_avatar_url?: string | null
          author_role?: string | null
          author_role_en?: string | null
          author_role_es?: string | null
          authoring_language?: string
          body: string
          body_blocks?: Json | null
          body_blocks_en?: Json | null
          body_blocks_es?: Json | null
          body_en?: string | null
          body_en_is_auto?: boolean
          body_es_is_auto?: boolean
          category?: string | null
          cover_bg_preset?: string | null
          cover_icon?: string | null
          cover_icon_auto_suggested?: boolean | null
          cover_icon_secondary?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          excerpt_en?: string | null
          excerpt_en_is_auto?: boolean
          excerpt_es_is_auto?: boolean
          id?: string
          is_published?: boolean | null
          last_viewed_at?: string | null
          og_image_url?: string | null
          published_at?: string | null
          read_time_minutes?: number | null
          reading_time_minutes?: number | null
          reading_time_override?: boolean | null
          scheduled_for?: string | null
          sent_to_subscribers_at?: string | null
          sent_to_subscribers_count?: number
          seo_description?: string | null
          seo_description_en?: string | null
          seo_description_es?: string | null
          seo_title?: string | null
          seo_title_en?: string | null
          seo_title_es?: string | null
          shop_id?: string | null
          slug: string
          slug_en?: string | null
          snapshot_en?: Json | null
          snapshot_es?: Json | null
          status?: string | null
          subtitle?: string | null
          subtitle_en?: string | null
          subtitle_es?: string | null
          tags?: string[] | null
          title: string
          title_en?: string | null
          title_en_is_auto?: boolean
          title_es_is_auto?: boolean
          updated_at?: string | null
          view_count?: number | null
          word_count?: number | null
        }
        Update: {
          ai_generated?: boolean | null
          ai_model?: string | null
          ai_prompt?: string | null
          author?: string | null
          author_avatar_url?: string | null
          author_role?: string | null
          author_role_en?: string | null
          author_role_es?: string | null
          authoring_language?: string
          body?: string
          body_blocks?: Json | null
          body_blocks_en?: Json | null
          body_blocks_es?: Json | null
          body_en?: string | null
          body_en_is_auto?: boolean
          body_es_is_auto?: boolean
          category?: string | null
          cover_bg_preset?: string | null
          cover_icon?: string | null
          cover_icon_auto_suggested?: boolean | null
          cover_icon_secondary?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          excerpt_en?: string | null
          excerpt_en_is_auto?: boolean
          excerpt_es_is_auto?: boolean
          id?: string
          is_published?: boolean | null
          last_viewed_at?: string | null
          og_image_url?: string | null
          published_at?: string | null
          read_time_minutes?: number | null
          reading_time_minutes?: number | null
          reading_time_override?: boolean | null
          scheduled_for?: string | null
          sent_to_subscribers_at?: string | null
          sent_to_subscribers_count?: number
          seo_description?: string | null
          seo_description_en?: string | null
          seo_description_es?: string | null
          seo_title?: string | null
          seo_title_en?: string | null
          seo_title_es?: string | null
          shop_id?: string | null
          slug?: string
          slug_en?: string | null
          snapshot_en?: Json | null
          snapshot_es?: Json | null
          status?: string | null
          subtitle?: string | null
          subtitle_en?: string | null
          subtitle_es?: string | null
          tags?: string[] | null
          title?: string
          title_en?: string | null
          title_en_is_auto?: boolean
          title_es_is_auto?: boolean
          updated_at?: string | null
          view_count?: number | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_publication_settings: {
        Row: {
          author_avatar_url: string | null
          author_bio_en: string | null
          author_bio_es: string | null
          author_first_name: string | null
          author_last_name: string | null
          author_role_en: string | null
          author_role_es: string | null
          created_at: string
          id: string
          share_copy_enabled: boolean
          share_email_enabled: boolean
          share_facebook_enabled: boolean
          share_instagram_enabled: boolean
          share_linkedin_enabled: boolean
          share_threads_enabled: boolean
          share_whatsapp_enabled: boolean
          share_x_enabled: boolean
          share_youtube_enabled: boolean
          shop_id: string | null
          singleton: boolean
          social_bluesky: string | null
          social_discord: string | null
          social_email: string | null
          social_facebook: string | null
          social_instagram: string | null
          social_linkedin: string | null
          social_rss: string | null
          social_threads: string | null
          social_tiktok: string | null
          social_whatsapp: string | null
          social_x: string | null
          social_youtube: string | null
          updated_at: string
        }
        Insert: {
          author_avatar_url?: string | null
          author_bio_en?: string | null
          author_bio_es?: string | null
          author_first_name?: string | null
          author_last_name?: string | null
          author_role_en?: string | null
          author_role_es?: string | null
          created_at?: string
          id?: string
          share_copy_enabled?: boolean
          share_email_enabled?: boolean
          share_facebook_enabled?: boolean
          share_instagram_enabled?: boolean
          share_linkedin_enabled?: boolean
          share_threads_enabled?: boolean
          share_whatsapp_enabled?: boolean
          share_x_enabled?: boolean
          share_youtube_enabled?: boolean
          shop_id?: string | null
          singleton?: boolean
          social_bluesky?: string | null
          social_discord?: string | null
          social_email?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_rss?: string | null
          social_threads?: string | null
          social_tiktok?: string | null
          social_whatsapp?: string | null
          social_x?: string | null
          social_youtube?: string | null
          updated_at?: string
        }
        Update: {
          author_avatar_url?: string | null
          author_bio_en?: string | null
          author_bio_es?: string | null
          author_first_name?: string | null
          author_last_name?: string | null
          author_role_en?: string | null
          author_role_es?: string | null
          created_at?: string
          id?: string
          share_copy_enabled?: boolean
          share_email_enabled?: boolean
          share_facebook_enabled?: boolean
          share_instagram_enabled?: boolean
          share_linkedin_enabled?: boolean
          share_threads_enabled?: boolean
          share_whatsapp_enabled?: boolean
          share_x_enabled?: boolean
          share_youtube_enabled?: boolean
          shop_id?: string | null
          singleton?: boolean
          social_bluesky?: string | null
          social_discord?: string | null
          social_email?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_rss?: string | null
          social_threads?: string | null
          social_tiktok?: string | null
          social_whatsapp?: string | null
          social_x?: string | null
          social_youtube?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_publication_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_draft_holds: {
        Row: {
          barber_id: string
          created_at: string
          draft_id: string
          ends_at: string
          expires_at: string
          id: string
          shop_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          barber_id: string
          created_at?: string
          draft_id: string
          ends_at: string
          expires_at: string
          id?: string
          shop_id?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          barber_id?: string
          created_at?: string
          draft_id?: string
          ends_at?: string
          expires_at?: string
          id?: string
          shop_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_draft_holds_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_draft_holds_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "booking_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_draft_holds_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_drafts: {
        Row: {
          acuity_attempted_at: string | null
          acuity_id: number | null
          addon_ids: number[] | null
          applied_benefit_redemption_id: string | null
          appointment_id: string | null
          appointment_type_id: number | null
          ath_auth_token: string | null
          ath_ecommerce_id: string | null
          barber_id: string | null
          benefit_discount_cents: number
          calendar_id: number | null
          claimed_at: string | null
          claimed_by: string | null
          client_id: string | null
          committed_at: string | null
          created_at: string
          created_by_user_id: string | null
          created_via: string
          datetime: string
          email: string | null
          expires_at: string
          failure_reason: string | null
          first_name: string
          id: string
          idempotency_key: string | null
          last_name: string | null
          notes: string | null
          paypal_order_id: string | null
          phone: string
          products: Json
          products_total_cents: number
          reconciliation_reason: string | null
          shop_id: string | null
          source: string
          status: string
          stripe_checkout_session_id: string | null
          stuck_alerted_at: string | null
          tip_cents: number
          total_cents: number
        }
        Insert: {
          acuity_attempted_at?: string | null
          acuity_id?: number | null
          addon_ids?: number[] | null
          applied_benefit_redemption_id?: string | null
          appointment_id?: string | null
          appointment_type_id?: number | null
          ath_auth_token?: string | null
          ath_ecommerce_id?: string | null
          barber_id?: string | null
          benefit_discount_cents?: number
          calendar_id?: number | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_id?: string | null
          committed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          created_via?: string
          datetime: string
          email?: string | null
          expires_at?: string
          failure_reason?: string | null
          first_name: string
          id?: string
          idempotency_key?: string | null
          last_name?: string | null
          notes?: string | null
          paypal_order_id?: string | null
          phone: string
          products?: Json
          products_total_cents?: number
          reconciliation_reason?: string | null
          shop_id?: string | null
          source: string
          status?: string
          stripe_checkout_session_id?: string | null
          stuck_alerted_at?: string | null
          tip_cents?: number
          total_cents: number
        }
        Update: {
          acuity_attempted_at?: string | null
          acuity_id?: number | null
          addon_ids?: number[] | null
          applied_benefit_redemption_id?: string | null
          appointment_id?: string | null
          appointment_type_id?: number | null
          ath_auth_token?: string | null
          ath_ecommerce_id?: string | null
          barber_id?: string | null
          benefit_discount_cents?: number
          calendar_id?: number | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_id?: string | null
          committed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          created_via?: string
          datetime?: string
          email?: string | null
          expires_at?: string
          failure_reason?: string | null
          first_name?: string
          id?: string
          idempotency_key?: string | null
          last_name?: string | null
          notes?: string | null
          paypal_order_id?: string | null
          phone?: string
          products?: Json
          products_total_cents?: number
          reconciliation_reason?: string | null
          shop_id?: string | null
          source?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stuck_alerted_at?: string | null
          tip_cents?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_drafts_applied_benefit_redemption_id_fkey"
            columns: ["applied_benefit_redemption_id"]
            isOneToOne: false
            referencedRelation: "client_benefit_redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_drafts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_rules: {
        Row: {
          barber_id: string | null
          cancel_deadline_type: string
          cancel_window_hours: number
          created_at: string
          id: string
          is_active: boolean
          max_advance_days: number
          max_per_day: number | null
          min_advance_minutes: number
          padding_after_minutes: number
          padding_before_minutes: number
          scope: string
          service_id: string | null
          shop_id: string | null
          slot_interval_minutes: number
          updated_at: string
        }
        Insert: {
          barber_id?: string | null
          cancel_deadline_type?: string
          cancel_window_hours?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_advance_days?: number
          max_per_day?: number | null
          min_advance_minutes?: number
          padding_after_minutes?: number
          padding_before_minutes?: number
          scope?: string
          service_id?: string | null
          shop_id?: string | null
          slot_interval_minutes?: number
          updated_at?: string
        }
        Update: {
          barber_id?: string | null
          cancel_deadline_type?: string
          cancel_window_hours?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_advance_days?: number
          max_per_day?: number | null
          min_advance_minutes?: number
          padding_after_minutes?: number
          padding_before_minutes?: number
          scope?: string
          service_id?: string | null
          shop_id?: string | null
          slot_interval_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_rules_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_rules_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_rules_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_receipts: {
        Row: {
          broadcast_id: string
          client_id: string
          dismissed_at: string | null
          id: string
          opened_at: string | null
          push_error: string | null
          push_success: boolean
          sent_at: string
        }
        Insert: {
          broadcast_id: string
          client_id: string
          dismissed_at?: string | null
          id?: string
          opened_at?: string | null
          push_error?: string | null
          push_success?: boolean
          sent_at?: string
        }
        Update: {
          broadcast_id?: string
          client_id?: string
          dismissed_at?: string | null
          id?: string
          opened_at?: string | null
          push_error?: string | null
          push_success?: boolean
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_receipts_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_receipts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_receipts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience_count: number
          body_en: string
          body_es: string
          created_at: string
          created_by: string | null
          cta_label_en: string | null
          cta_label_es: string | null
          cta_url: string | null
          delivered_count: number
          failed_count: number
          hero_image_url: string | null
          id: string
          pill_en: string | null
          pill_es: string | null
          sent_at: string | null
          shop_id: string | null
          status: string
          title_en: string
          title_es: string
          updated_at: string
        }
        Insert: {
          audience_count?: number
          body_en: string
          body_es: string
          created_at?: string
          created_by?: string | null
          cta_label_en?: string | null
          cta_label_es?: string | null
          cta_url?: string | null
          delivered_count?: number
          failed_count?: number
          hero_image_url?: string | null
          id?: string
          pill_en?: string | null
          pill_es?: string | null
          sent_at?: string | null
          shop_id?: string | null
          status?: string
          title_en: string
          title_es: string
          updated_at?: string
        }
        Update: {
          audience_count?: number
          body_en?: string
          body_es?: string
          created_at?: string
          created_by?: string | null
          cta_label_en?: string | null
          cta_label_es?: string | null
          cta_url?: string | null
          delivered_count?: number
          failed_count?: number
          hero_image_url?: string | null
          id?: string
          pill_en?: string | null
          pill_es?: string | null
          sent_at?: string | null
          shop_id?: string | null
          status?: string
          title_en?: string
          title_es?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      check_counter: {
        Row: {
          id: string
          next_number: number
          shop_id: string | null
        }
        Insert: {
          id?: string
          next_number?: number
          shop_id?: string | null
        }
        Update: {
          id?: string
          next_number?: number
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_counter_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      client_benefit_redemptions: {
        Row: {
          benefit_id: string
          claimed_at: string
          client_id: string
          code: string
          created_at: string
          expires_at: string
          gift_year: number | null
          id: string
          points_cost: number
          redeemed_appointment_id: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          redeemed_transaction_id: string | null
          updated_at: string
          void_reason: string | null
        }
        Insert: {
          benefit_id: string
          claimed_at?: string
          client_id: string
          code: string
          created_at?: string
          expires_at: string
          gift_year?: number | null
          id?: string
          points_cost: number
          redeemed_appointment_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          redeemed_transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
        }
        Update: {
          benefit_id?: string
          claimed_at?: string
          client_id?: string
          code?: string
          created_at?: string
          expires_at?: string
          gift_year?: number | null
          id?: string
          points_cost?: number
          redeemed_appointment_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          redeemed_transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_benefit_redemptions_benefit_id_fkey"
            columns: ["benefit_id"]
            isOneToOne: false
            referencedRelation: "rewards_benefits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_benefit_redemptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_benefit_redemptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_benefit_redemptions_redeemed_appointment_id_fkey"
            columns: ["redeemed_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_benefit_redemptions_redeemed_transaction_id_fkey"
            columns: ["redeemed_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_duplicate_decisions: {
        Row: {
          client_ids: string[]
          decided_at: string
          decided_by: string
          decision: string
          expires_at: string | null
          fingerprint: string
          id: string
          shop_id: string
        }
        Insert: {
          client_ids: string[]
          decided_at?: string
          decided_by: string
          decision: string
          expires_at?: string | null
          fingerprint: string
          id?: string
          shop_id: string
        }
        Update: {
          client_ids?: string[]
          decided_at?: string
          decided_by?: string
          decision?: string
          expires_at?: string | null
          fingerprint?: string
          id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_duplicate_decisions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      client_referral_attributions: {
        Row: {
          attribution_status: string
          client_id: string
          created_at: string
          current_referral_owner_id: string
          id: string
          last_payment_at: string | null
          original_referral_link_id: string | null
          original_referral_owner_id: string
          reallocated_at: string | null
          reallocation_reason: string | null
          reset_available_at: string | null
          updated_at: string
        }
        Insert: {
          attribution_status?: string
          client_id: string
          created_at?: string
          current_referral_owner_id: string
          id?: string
          last_payment_at?: string | null
          original_referral_link_id?: string | null
          original_referral_owner_id: string
          reallocated_at?: string | null
          reallocation_reason?: string | null
          reset_available_at?: string | null
          updated_at?: string
        }
        Update: {
          attribution_status?: string
          client_id?: string
          created_at?: string
          current_referral_owner_id?: string
          id?: string
          last_payment_at?: string | null
          original_referral_link_id?: string | null
          original_referral_owner_id?: string
          reallocated_at?: string | null
          reallocation_reason?: string | null
          reset_available_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_referral_attributions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_referral_attributions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_referral_attributions_current_referral_owner_id_fkey"
            columns: ["current_referral_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_referral_attributions_original_referral_link_id_fkey"
            columns: ["original_referral_link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_referral_attributions_original_referral_owner_id_fkey"
            columns: ["original_referral_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      client_review_verifications: {
        Row: {
          appointment_id: string | null
          author_display_name: string | null
          client_id: string
          created_at: string
          google_review_id: string
          id: string
          notes: string | null
          shop_id: string | null
          status: string
          unlinked_at: string | null
          unlinked_by: string | null
          verified_at: string
          verified_by: string
        }
        Insert: {
          appointment_id?: string | null
          author_display_name?: string | null
          client_id: string
          created_at?: string
          google_review_id: string
          id?: string
          notes?: string | null
          shop_id?: string | null
          status?: string
          unlinked_at?: string | null
          unlinked_by?: string | null
          verified_at?: string
          verified_by: string
        }
        Update: {
          appointment_id?: string | null
          author_display_name?: string | null
          client_id?: string
          created_at?: string
          google_review_id?: string
          id?: string
          notes?: string | null
          shop_id?: string | null
          status?: string
          unlinked_at?: string | null
          unlinked_by?: string | null
          verified_at?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_review_verifications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      client_rewards_archive: {
        Row: {
          archived_at: string
          email: string | null
          id: string
          kind: string
          original_client_id: string
          phone10: string | null
          restored_at: string | null
          restored_to_client_id: string | null
          row_data: Json
        }
        Insert: {
          archived_at?: string
          email?: string | null
          id?: string
          kind: string
          original_client_id: string
          phone10?: string | null
          restored_at?: string | null
          restored_to_client_id?: string | null
          row_data: Json
        }
        Update: {
          archived_at?: string
          email?: string | null
          id?: string
          kind?: string
          original_client_id?: string
          phone10?: string | null
          restored_at?: string | null
          restored_to_client_id?: string | null
          row_data?: Json
        }
        Relationships: []
      }
      client_rewards_ledger: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          description_en: string | null
          description_es: string | null
          id: string
          metadata: Json
          points: number
          source_appointment_id: string | null
          source_referral_client_id: string | null
          source_transaction_id: string | null
          source_type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          description_en?: string | null
          description_es?: string | null
          id?: string
          metadata?: Json
          points: number
          source_appointment_id?: string | null
          source_referral_client_id?: string | null
          source_transaction_id?: string | null
          source_type: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          description_en?: string | null
          description_es?: string | null
          id?: string
          metadata?: Json
          points?: number
          source_appointment_id?: string | null
          source_referral_client_id?: string | null
          source_transaction_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_rewards_ledger_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_rewards_ledger_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_rewards_ledger_source_appointment_id_fkey"
            columns: ["source_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_rewards_ledger_source_referral_client_id_fkey"
            columns: ["source_referral_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_rewards_ledger_source_referral_client_id_fkey"
            columns: ["source_referral_client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_rewards_ledger_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_verified: boolean
          acuity_client_id: number | null
          ath_phone: string | null
          ath_phone_last4: string | null
          auth_user_id: string | null
          avatar_url: string | null
          booking_source: string | null
          card_brand: string | null
          card_last4: string | null
          conversion_prompted_at: string | null
          conversion_prompted_count: number
          created_at: string
          date_of_birth: string | null
          default_payment_method_id: string | null
          email: string | null
          first_name: string
          gender: string | null
          id: string
          is_guest: boolean
          last_name: string | null
          last_relink_at: string | null
          last_visit_at: string | null
          newsletter_language: string
          newsletter_opt_in: boolean
          newsletter_opt_in_at: string | null
          newsletter_source: string | null
          notes: string | null
          notifications_enabled: boolean
          notifications_permission_asked: boolean
          notify_email_appointments: boolean
          notify_email_marketing: boolean
          notify_push_appointments: boolean
          notify_sms_appointments: boolean
          notify_sms_marketing: boolean
          notify_whatsapp_appointments: boolean
          notify_whatsapp_marketing: boolean
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          phone: string | null
          preferred_barber_id: string | null
          preferred_payment_method: string | null
          preferred_payment_methods: string[]
          referral_slug: string | null
          referral_slug_updated_at: string | null
          shop_id: string | null
          sms_opt_in: boolean
          stripe_customer_id: string | null
          total_spent_cents: number
          total_visits: number
          updated_at: string
        }
        Insert: {
          account_verified?: boolean
          acuity_client_id?: number | null
          ath_phone?: string | null
          ath_phone_last4?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          booking_source?: string | null
          card_brand?: string | null
          card_last4?: string | null
          conversion_prompted_at?: string | null
          conversion_prompted_count?: number
          created_at?: string
          date_of_birth?: string | null
          default_payment_method_id?: string | null
          email?: string | null
          first_name: string
          gender?: string | null
          id?: string
          is_guest?: boolean
          last_name?: string | null
          last_relink_at?: string | null
          last_visit_at?: string | null
          newsletter_language?: string
          newsletter_opt_in?: boolean
          newsletter_opt_in_at?: string | null
          newsletter_source?: string | null
          notes?: string | null
          notifications_enabled?: boolean
          notifications_permission_asked?: boolean
          notify_email_appointments?: boolean
          notify_email_marketing?: boolean
          notify_push_appointments?: boolean
          notify_sms_appointments?: boolean
          notify_sms_marketing?: boolean
          notify_whatsapp_appointments?: boolean
          notify_whatsapp_marketing?: boolean
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          phone?: string | null
          preferred_barber_id?: string | null
          preferred_payment_method?: string | null
          preferred_payment_methods?: string[]
          referral_slug?: string | null
          referral_slug_updated_at?: string | null
          shop_id?: string | null
          sms_opt_in?: boolean
          stripe_customer_id?: string | null
          total_spent_cents?: number
          total_visits?: number
          updated_at?: string
        }
        Update: {
          account_verified?: boolean
          acuity_client_id?: number | null
          ath_phone?: string | null
          ath_phone_last4?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          booking_source?: string | null
          card_brand?: string | null
          card_last4?: string | null
          conversion_prompted_at?: string | null
          conversion_prompted_count?: number
          created_at?: string
          date_of_birth?: string | null
          default_payment_method_id?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          is_guest?: boolean
          last_name?: string | null
          last_relink_at?: string | null
          last_visit_at?: string | null
          newsletter_language?: string
          newsletter_opt_in?: boolean
          newsletter_opt_in_at?: string | null
          newsletter_source?: string | null
          notes?: string | null
          notifications_enabled?: boolean
          notifications_permission_asked?: boolean
          notify_email_appointments?: boolean
          notify_email_marketing?: boolean
          notify_push_appointments?: boolean
          notify_sms_appointments?: boolean
          notify_sms_marketing?: boolean
          notify_whatsapp_appointments?: boolean
          notify_whatsapp_marketing?: boolean
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          phone?: string | null
          preferred_barber_id?: string | null
          preferred_payment_method?: string | null
          preferred_payment_methods?: string[]
          referral_slug?: string | null
          referral_slug_updated_at?: string | null
          shop_id?: string | null
          sms_opt_in?: boolean
          stripe_customer_id?: string | null
          total_spent_cents?: number
          total_visits?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_preferred_barber_id_fkey"
            columns: ["preferred_barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          archived_at: string | null
          created_at: string
          email: string | null
          first_name: string
          from_email: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          is_existing_client: boolean
          language: string
          last_name: string | null
          matched_client_id: string | null
          message: string | null
          phone: string | null
          read_at: string | null
          shop_id: string | null
          source: string
          status: Database["public"]["Enums"]["submission_status"]
          subject: string | null
          to_email: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          from_email?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_existing_client?: boolean
          language?: string
          last_name?: string | null
          matched_client_id?: string | null
          message?: string | null
          phone?: string | null
          read_at?: string | null
          shop_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["submission_status"]
          subject?: string | null
          to_email?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          from_email?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_existing_client?: boolean
          language?: string
          last_name?: string | null
          matched_client_id?: string | null
          message?: string | null
          phone?: string | null
          read_at?: string | null
          shop_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["submission_status"]
          subject?: string | null
          to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_submissions_matched_client_id_fkey"
            columns: ["matched_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_submissions_matched_client_id_fkey"
            columns: ["matched_client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_submissions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      csv_imports: {
        Row: {
          created_at: string
          error_message: string | null
          filename: string
          id: string
          imported_by: string | null
          rows_imported: number
          rows_skipped: number
          rows_total: number
          status: string
          weeks_covered: string[] | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          filename: string
          id?: string
          imported_by?: string | null
          rows_imported: number
          rows_skipped?: number
          rows_total: number
          status?: string
          weeks_covered?: string[] | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          filename?: string
          id?: string
          imported_by?: string | null
          rows_imported?: number
          rows_skipped?: number
          rows_total?: number
          status?: string
          weeks_covered?: string[] | null
        }
        Relationships: []
      }
      debug_logs: {
        Row: {
          created_at: string
          id: string
          payload: Json
          tag: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          tag: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          tag?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      deleted_appointment_tombstones: {
        Row: {
          acuity_id: number
          appointment_id: string | null
          client_name: string | null
          deleted_at: string
          reason: string | null
          shop_id: string | null
          source: string
          starts_at: string | null
        }
        Insert: {
          acuity_id: number
          appointment_id?: string | null
          client_name?: string | null
          deleted_at?: string
          reason?: string | null
          shop_id?: string | null
          source?: string
          starts_at?: string | null
        }
        Update: {
          acuity_id?: number
          appointment_id?: string | null
          client_name?: string | null
          deleted_at?: string
          reason?: string | null
          shop_id?: string | null
          source?: string
          starts_at?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          shop_id: string | null
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          shop_id?: string | null
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          shop_id?: string | null
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_fixed: boolean
          name: string
          shop_id: string | null
          sort_order: number
          weekly_amount_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_fixed?: boolean
          name: string
          shop_id?: string | null
          sort_order?: number
          weekly_amount_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_fixed?: boolean
          name?: string
          shop_id?: string | null
          sort_order?: number
          weekly_amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "expenses_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      filho_conversations: {
        Row: {
          id: string
          last_message_at: string
          message_count: number
          role: string
          started_at: string
          summary: string | null
          user_id: string
        }
        Insert: {
          id?: string
          last_message_at?: string
          message_count?: number
          role: string
          started_at?: string
          summary?: string | null
          user_id: string
        }
        Update: {
          id?: string
          last_message_at?: string
          message_count?: number
          role?: string
          started_at?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: []
      }
      filho_identity_attempts: {
        Row: {
          attempted_first_name: string | null
          attempted_last_name: string | null
          attempted_phone_last4: string | null
          created_at: string
          id: string
          ip_hash: string
          matched_client_id: string | null
          success: boolean
        }
        Insert: {
          attempted_first_name?: string | null
          attempted_last_name?: string | null
          attempted_phone_last4?: string | null
          created_at?: string
          id?: string
          ip_hash: string
          matched_client_id?: string | null
          success?: boolean
        }
        Update: {
          attempted_first_name?: string | null
          attempted_last_name?: string | null
          attempted_phone_last4?: string | null
          created_at?: string
          id?: string
          ip_hash?: string
          matched_client_id?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "filho_identity_attempts_matched_client_id_fkey"
            columns: ["matched_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filho_identity_attempts_matched_client_id_fkey"
            columns: ["matched_client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      filho_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          feedback: number | null
          id: string
          role: string
          tool_calls: Json | null
          tool_name: string | null
          tool_result: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          feedback?: number | null
          id?: string
          role: string
          tool_calls?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          feedback?: number | null
          id?: string
          role?: string
          tool_calls?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "filho_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "filho_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_sync_queue: {
        Row: {
          appointment_id: string
          attempt_count: number
          created_at: string
          event_id: string
          event_type: string
          http_status: number | null
          id: string
          last_error: string | null
          payload: Json | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          attempt_count?: number
          created_at?: string
          event_id?: string
          event_type: string
          http_status?: number | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          attempt_count?: number
          created_at?: string
          event_id?: string
          event_type?: string
          http_status?: number | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_sync_queue_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      home_expense_settings: {
        Row: {
          recurring_source: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          recurring_source?: string
          shop_id?: string
          updated_at?: string
        }
        Update: {
          recurring_source?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_expense_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_job_secret: {
        Row: {
          created_at: string
          id: boolean
          secret: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          secret?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          secret?: string
        }
        Relationships: []
      }
      launch_checklist: {
        Row: {
          category: string
          confirmed_at: string | null
          confirmed_by_note: string | null
          created_at: string
          description: string | null
          id: string
          shop_id: string | null
          sort_order: number
          status: Database["public"]["Enums"]["checklist_status"]
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          category: string
          confirmed_at?: string | null
          confirmed_by_note?: string | null
          created_at?: string
          description?: string | null
          id?: string
          shop_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["checklist_status"]
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          category?: string
          confirmed_at?: string | null
          confirmed_by_note?: string | null
          created_at?: string
          description?: string | null
          id?: string
          shop_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["checklist_status"]
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "launch_checklist_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_points: {
        Row: {
          balance: number
          client_id: string
          id: string
          tier: string
          updated_at: string
        }
        Insert: {
          balance?: number
          client_id: string
          id?: string
          tier?: string
          updated_at?: string
        }
        Update: {
          balance?: number
          client_id?: string
          id?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_points_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          client_id: string
          created_at: string
          id: string
          points: number
          reason: string
          reference_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          points: number
          reason: string
          reference_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          points?: number
          reason?: string
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_dispatch_log: {
        Row: {
          appointment_id: string | null
          client_id: string | null
          created_at: string
          dispatch_key: string
          failure_count: number
          id: string
          metadata: Json
          shop_id: string | null
          subscription_count: number
          success_count: number
          template_name: string
        }
        Insert: {
          appointment_id?: string | null
          client_id?: string | null
          created_at?: string
          dispatch_key: string
          failure_count?: number
          id?: string
          metadata?: Json
          shop_id?: string | null
          subscription_count?: number
          success_count?: number
          template_name: string
        }
        Update: {
          appointment_id?: string | null
          client_id?: string | null
          created_at?: string
          dispatch_key?: string
          failure_count?: number
          id?: string
          metadata?: Json
          shop_id?: string | null
          subscription_count?: number
          success_count?: number
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_dispatch_log_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_dispatch_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_dispatch_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_template_history: {
        Row: {
          body_en_new: string | null
          body_en_old: string | null
          body_es_new: string | null
          body_es_old: string | null
          change_kind: string
          changed_at: string
          changed_by: string | null
          id: string
          is_enabled_new: boolean | null
          is_enabled_old: boolean | null
          offset_minutes_new: number | null
          offset_minutes_old: number | null
          template_id: string
          template_name: string
          title_en_new: string | null
          title_en_old: string | null
          title_es_new: string | null
          title_es_old: string | null
        }
        Insert: {
          body_en_new?: string | null
          body_en_old?: string | null
          body_es_new?: string | null
          body_es_old?: string | null
          change_kind?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          is_enabled_new?: boolean | null
          is_enabled_old?: boolean | null
          offset_minutes_new?: number | null
          offset_minutes_old?: number | null
          template_id: string
          template_name: string
          title_en_new?: string | null
          title_en_old?: string | null
          title_es_new?: string | null
          title_es_old?: string | null
        }
        Update: {
          body_en_new?: string | null
          body_en_old?: string | null
          body_es_new?: string | null
          body_es_old?: string | null
          change_kind?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          is_enabled_new?: boolean | null
          is_enabled_old?: boolean | null
          offset_minutes_new?: number | null
          offset_minutes_old?: number | null
          template_id?: string
          template_name?: string
          title_en_new?: string | null
          title_en_old?: string | null
          title_es_new?: string | null
          title_es_old?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_template_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_en: string
          body_es: string
          category: string
          created_at: string
          id: string
          is_enabled: boolean
          name: string
          offset_minutes: number | null
          shop_id: string | null
          title_en: string
          title_es: string
          updated_at: string
          updated_by: string | null
          url_path: string | null
        }
        Insert: {
          body_en: string
          body_es: string
          category?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          name: string
          offset_minutes?: number | null
          shop_id?: string | null
          title_en: string
          title_es: string
          updated_at?: string
          updated_by?: string | null
          url_path?: string | null
        }
        Update: {
          body_en?: string
          body_es?: string
          category?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          name?: string
          offset_minutes?: number | null
          shop_id?: string | null
          title_en?: string
          title_es?: string
          updated_at?: string
          updated_by?: string | null
          url_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_expenses: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string
          description: string
          end_date: string | null
          expense_date: string
          frequency: string
          id: string
          is_active: boolean
          shop_id: string
          title: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string
          description?: string
          end_date?: string | null
          expense_date: string
          frequency?: string
          id?: string
          is_active?: boolean
          shop_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string
          description?: string
          end_date?: string | null
          expense_date?: string
          frequency?: string
          id?: string
          is_active?: boolean
          shop_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_expenses_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_activity_logs: {
        Row: {
          action: string
          actor_barber_id: string | null
          actor_user_id: string
          client_id: string
          copied_at: string
          id: string
          shop_id: string | null
        }
        Insert: {
          action?: string
          actor_barber_id?: string | null
          actor_user_id: string
          client_id: string
          copied_at?: string
          id?: string
          shop_id?: string | null
        }
        Update: {
          action?: string
          actor_barber_id?: string | null
          actor_user_id?: string
          client_id?: string
          copied_at?: string
          id?: string
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_activity_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_activity_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_payouts: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          method: string
          note: string | null
          paid_at: string
          shop_id: string | null
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          shop_id?: string | null
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          shop_id?: string | null
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_payouts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_exceptions: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          created_at: string
          currency: string
          customer_contact: string | null
          customer_name: string | null
          draft_id: string | null
          failure_reason: string | null
          id: string
          owner_alerted_at: string | null
          payment_reference: string
          provider: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          shop_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          customer_contact?: string | null
          customer_name?: string | null
          draft_id?: string | null
          failure_reason?: string | null
          id?: string
          owner_alerted_at?: string | null
          payment_reference: string
          provider: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shop_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          customer_contact?: string | null
          customer_name?: string | null
          draft_id?: string | null
          failure_reason?: string | null
          id?: string
          owner_alerted_at?: string | null
          payment_reference?: string
          provider?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shop_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_exceptions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_exceptions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "booking_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_exceptions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_recurring_pushes: {
        Row: {
          barber: string | null
          client_id: string
          count: number
          created_at: string
          event_keys: string[]
          first_starts_at: string | null
          flushed_at: string | null
          id: string
          last_event_at: string
          last_starts_at: string | null
          recurring_group_id: string
          service: string | null
          shop_id: string | null
          template_name: string
        }
        Insert: {
          barber?: string | null
          client_id: string
          count?: number
          created_at?: string
          event_keys?: string[]
          first_starts_at?: string | null
          flushed_at?: string | null
          id?: string
          last_event_at?: string
          last_starts_at?: string | null
          recurring_group_id: string
          service?: string | null
          shop_id?: string | null
          template_name: string
        }
        Update: {
          barber?: string | null
          client_id?: string
          count?: number
          created_at?: string
          event_keys?: string[]
          first_starts_at?: string | null
          flushed_at?: string | null
          id?: string
          last_event_at?: string
          last_starts_at?: string | null
          recurring_group_id?: string
          service?: string | null
          shop_id?: string | null
          template_name?: string
        }
        Relationships: []
      }
      production_goals: {
        Row: {
          barber_id: string | null
          created_at: string
          id: string
          shop_id: string | null
          target_cents: number
          week_start: string
        }
        Insert: {
          barber_id?: string | null
          created_at?: string
          id?: string
          shop_id?: string | null
          target_cents: number
          week_start: string
        }
        Update: {
          barber_id?: string | null
          created_at?: string
          id?: string
          shop_id?: string | null
          target_cents?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_goals_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_goals_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          commission_rate: number
          cost_cents: number | null
          created_at: string
          description: string | null
          eligible_for_commission: boolean
          id: string
          image_url: string | null
          is_active: boolean
          is_sellable: boolean | null
          low_stock_threshold: number
          name: string
          price_cents: number
          shop_id: string | null
          show_in_checkout: boolean
          sku: string | null
          sort_order: number
          stock_count: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          commission_rate?: number
          cost_cents?: number | null
          created_at?: string
          description?: string | null
          eligible_for_commission?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_sellable?: boolean | null
          low_stock_threshold?: number
          name: string
          price_cents: number
          shop_id?: string | null
          show_in_checkout?: boolean
          sku?: string | null
          sort_order?: number
          stock_count?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          commission_rate?: number
          cost_cents?: number | null
          created_at?: string
          description?: string | null
          eligible_for_commission?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_sellable?: boolean | null
          low_stock_threshold?: number
          name?: string
          price_cents?: number
          shop_id?: string | null
          show_in_checkout?: boolean
          sku?: string | null
          sort_order?: number
          stock_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          barber_id: string | null
          created_at: string
          employee_id: string | null
          full_name: string
          id: string
          phone: string | null
          ssn_last4: string | null
        }
        Insert: {
          barber_id?: string | null
          created_at?: string
          employee_id?: string | null
          full_name: string
          id: string
          phone?: string | null
          ssn_last4?: string | null
        }
        Update: {
          barber_id?: string | null
          created_at?: string
          employee_id?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          ssn_last4?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          client_id: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          language: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          client_id: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          language?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          client_id?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          language?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      pwa_installs: {
        Row: {
          client_id: string | null
          display_mode: string | null
          id: string
          installed_at: string
          platform: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          client_id?: string | null
          display_mode?: string | null
          id?: string
          installed_at?: string
          platform?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          client_id?: string | null
          display_mode?: string | null
          id?: string
          installed_at?: string
          platform?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pwa_installs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pwa_installs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          hit_at: string
          id: number
          key: string
        }
        Insert: {
          hit_at?: string
          id?: number
          key: string
        }
        Update: {
          hit_at?: string
          id?: number
          key?: string
        }
        Relationships: []
      }
      recruitment_submissions: {
        Row: {
          archived_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          experience: string | null
          id: string
          is_existing_client: boolean
          language: string
          matched_client_id: string | null
          message: string | null
          passion: string | null
          read_at: string | null
          shop_id: string | null
          social: string | null
          source: string
          status: Database["public"]["Enums"]["submission_status"]
          workplace: string | null
        }
        Insert: {
          archived_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          experience?: string | null
          id?: string
          is_existing_client?: boolean
          language?: string
          matched_client_id?: string | null
          message?: string | null
          passion?: string | null
          read_at?: string | null
          shop_id?: string | null
          social?: string | null
          source?: string
          status?: Database["public"]["Enums"]["submission_status"]
          workplace?: string | null
        }
        Update: {
          archived_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          experience?: string | null
          id?: string
          is_existing_client?: boolean
          language?: string
          matched_client_id?: string | null
          message?: string | null
          passion?: string | null
          read_at?: string | null
          shop_id?: string | null
          social?: string | null
          source?: string
          status?: Database["public"]["Enums"]["submission_status"]
          workplace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_submissions_matched_client_id_fkey"
            columns: ["matched_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_submissions_matched_client_id_fkey"
            columns: ["matched_client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_submissions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_activity_log: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          event_type: string
          id: string
          metadata: Json | null
          referral_owner_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          referral_owner_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          referral_owner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_activity_log_referral_owner_id_fkey"
            columns: ["referral_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_attributions: {
        Row: {
          code: string | null
          conversion_type: string
          converted_at: string
          id: string
          ip_hash: string | null
          landing_url: string | null
          referred_client_id: string | null
          referrer_id: string
          referrer_type: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          code?: string | null
          conversion_type: string
          converted_at?: string
          id?: string
          ip_hash?: string | null
          landing_url?: string | null
          referred_client_id?: string | null
          referrer_id: string
          referrer_type: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          code?: string | null
          conversion_type?: string
          converted_at?: string
          id?: string
          ip_hash?: string | null
          landing_url?: string | null
          referred_client_id?: string | null
          referrer_id?: string
          referrer_type?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_attributions_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "referral_attributions_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "referral_attributions_referred_client_id_fkey"
            columns: ["referred_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_attributions_referred_client_id_fkey"
            columns: ["referred_client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          owner_id: string
          owner_type: string
          shop_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          owner_id: string
          owner_type: string
          shop_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          owner_id?: string
          owner_type?: string
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_links: {
        Row: {
          created_at: string
          full_url: string
          id: string
          referral_owner_id: string
          shop_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_url: string
          id?: string
          referral_owner_id: string
          shop_id?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_url?: string
          id?: string
          referral_owner_id?: string
          shop_id?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_links_referral_owner_id_fkey"
            columns: ["referral_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_links_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_network_edges: {
        Row: {
          branch_root_owner_id: string | null
          created_at: string
          depth: number
          direct_referrer_owner_id: string | null
          downline_owner_id: string
          id: string
          upline_owner_id: string
        }
        Insert: {
          branch_root_owner_id?: string | null
          created_at?: string
          depth?: number
          direct_referrer_owner_id?: string | null
          downline_owner_id: string
          id?: string
          upline_owner_id: string
        }
        Update: {
          branch_root_owner_id?: string | null
          created_at?: string
          depth?: number
          direct_referrer_owner_id?: string | null
          downline_owner_id?: string
          id?: string
          upline_owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_network_edges_branch_root_owner_id_fkey"
            columns: ["branch_root_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_network_edges_direct_referrer_owner_id_fkey"
            columns: ["direct_referrer_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_network_edges_downline_owner_id_fkey"
            columns: ["downline_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_network_edges_upline_owner_id_fkey"
            columns: ["upline_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_owners: {
        Row: {
          active: boolean
          created_at: string
          deleted_at: string | null
          display_name: string
          id: string
          owner_profile_id: string | null
          owner_type: string
          reroute_to_owner_id: string | null
          shop_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          display_name: string
          id?: string
          owner_profile_id?: string | null
          owner_type: string
          reroute_to_owner_id?: string | null
          shop_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id?: string
          owner_profile_id?: string | null
          owner_type?: string
          reroute_to_owner_id?: string | null
          shop_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_owners_reroute_to_owner_id_fkey"
            columns: ["reroute_to_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_owners_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_payments: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          client_id: string | null
          created_at: string
          id: string
          is_refund: boolean
          is_tip: boolean
          paid_at: string
          payment_type: string
          referral_owner_id: string
          shop_id: string | null
          source: string | null
          transaction_id: string | null
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          is_refund?: boolean
          is_tip?: boolean
          paid_at: string
          payment_type: string
          referral_owner_id: string
          shop_id?: string | null
          source?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          is_refund?: boolean
          is_tip?: boolean
          paid_at?: string
          payment_type?: string
          referral_owner_id?: string
          shop_id?: string | null
          source?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_payments_referral_owner_id_fkey"
            columns: ["referral_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_payments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_pending_matches: {
        Row: {
          appointment_id: string | null
          created_at: string
          granted_at: string | null
          id: string
          points_amount: number | null
          referred_client_id: string
          referrer_client_id: string
          status: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          granted_at?: string | null
          id?: string
          points_amount?: number | null
          referred_client_id: string
          referrer_client_id: string
          status?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          granted_at?: string | null
          id?: string
          points_amount?: number | null
          referred_client_id?: string
          referrer_client_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_pending_matches_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_pending_matches_referred_client_id_fkey"
            columns: ["referred_client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_pending_matches_referred_client_id_fkey"
            columns: ["referred_client_id"]
            isOneToOne: true
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_pending_matches_referrer_client_id_fkey"
            columns: ["referrer_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_pending_matches_referrer_client_id_fkey"
            columns: ["referrer_client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_ranks: {
        Row: {
          benefits_en: string | null
          benefits_es: string | null
          created_at: string
          id: string
          max_production_cents: number | null
          min_production_cents: number
          name_en: string
          name_es: string
          shop_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          benefits_en?: string | null
          benefits_es?: string | null
          created_at?: string
          id?: string
          max_production_cents?: number | null
          min_production_cents: number
          name_en: string
          name_es: string
          shop_id?: string | null
          sort_order: number
          updated_at?: string
        }
        Update: {
          benefits_en?: string | null
          benefits_es?: string | null
          created_at?: string
          id?: string
          max_production_cents?: number | null
          min_production_cents?: number
          name_en?: string
          name_es?: string
          shop_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_ranks_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_reallocation_progress: {
        Row: {
          barber_id: string
          client_id: string
          consecutive_count: number
          id: string
          last_paid_at: string | null
          updated_at: string
        }
        Insert: {
          barber_id: string
          client_id: string
          consecutive_count?: number
          id?: string
          last_paid_at?: string | null
          updated_at?: string
        }
        Update: {
          barber_id?: string
          client_id?: string
          consecutive_count?: number
          id?: string
          last_paid_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_reallocation_progress_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_reallocation_progress_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_reallocation_progress_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_slug_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_slug: string
          old_slug: string | null
          owner_id: string
          owner_type: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_slug: string
          old_slug?: string | null
          owner_id: string
          owner_type: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_slug?: string
          old_slug?: string | null
          owner_id?: string
          owner_type?: string
        }
        Relationships: []
      }
      referral_systems: {
        Row: {
          created_at: string
          description_en: string | null
          description_es: string | null
          id: string
          name_en: string
          name_es: string
          shop_id: string | null
          slug: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          id?: string
          name_en: string
          name_es: string
          shop_id?: string | null
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          id?: string
          name_en?: string
          name_es?: string
          shop_id?: string | null
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_systems_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_client_id: string | null
          referred_phone: string
          referrer_client_id: string
          reward_granted: boolean
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          referred_client_id?: string | null
          referred_phone: string
          referrer_client_id: string
          reward_granted?: boolean
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_client_id?: string | null
          referred_phone?: string
          referrer_client_id?: string
          reward_granted?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_client_id_fkey"
            columns: ["referred_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_client_id_fkey"
            columns: ["referred_client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_client_id_fkey"
            columns: ["referrer_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_client_id_fkey"
            columns: ["referrer_client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      review_prompt_events: {
        Row: {
          appointment_id: string
          channel: string
          client_id: string | null
          created_at: string
          event_type: string
          guest_identifier: string | null
          id: string
          shop_id: string | null
        }
        Insert: {
          appointment_id: string
          channel?: string
          client_id?: string | null
          created_at?: string
          event_type: string
          guest_identifier?: string | null
          id?: string
          shop_id?: string | null
        }
        Update: {
          appointment_id?: string
          channel?: string
          client_id?: string | null
          created_at?: string
          event_type?: string
          guest_identifier?: string | null
          id?: string
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_prompt_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          appointment_id: string | null
          barber_id: string
          client_id: string
          comment: string | null
          created_at: string
          id: string
          is_published: boolean
          rating: number
          shop_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          barber_id: string
          client_id: string
          comment?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          rating: number
          shop_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          barber_id?: string
          client_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          rating?: number
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards_benefits: {
        Row: {
          created_at: string
          description_en: string | null
          description_es: string | null
          discount_type: string
          discount_value_cents: number | null
          icon: string | null
          id: string
          internal_notes: string | null
          is_active: boolean
          kind: string
          required_points: number
          service_name_match: string | null
          shop_id: string | null
          sort_order: number
          title_en: string
          title_es: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          discount_type?: string
          discount_value_cents?: number | null
          icon?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          kind?: string
          required_points: number
          service_name_match?: string | null
          shop_id?: string | null
          sort_order?: number
          title_en: string
          title_es: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          discount_type?: string
          discount_value_cents?: number | null
          icon?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          kind?: string
          required_points?: number
          service_name_match?: string | null
          shop_id?: string | null
          sort_order?: number
          title_en?: string
          title_es?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_benefits_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      service_addons: {
        Row: {
          acuity_addon_id: number | null
          barber_id: string | null
          created_at: string
          duration_minutes: number
          id: string
          is_active: boolean
          last_synced_at: string
          name: string
          price_cents: number
          shop_id: string | null
        }
        Insert: {
          acuity_addon_id?: number | null
          barber_id?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          is_active?: boolean
          last_synced_at?: string
          name: string
          price_cents?: number
          shop_id?: string | null
        }
        Update: {
          acuity_addon_id?: number | null
          barber_id?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          is_active?: boolean
          last_synced_at?: string
          name?: string
          price_cents?: number
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_addons_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_addons_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          acuity_type_id: number | null
          addon_ids: number[] | null
          barber_id: string | null
          category: string | null
          color: string | null
          description: string | null
          duration_minutes: number
          form_ids: number[] | null
          id: string
          image_url: string | null
          is_active: boolean
          is_public: boolean
          last_synced_at: string
          locally_edited: boolean
          name: string
          padding_after_minutes: number
          padding_before_minutes: number
          price_cents: number
          scheduling_url: string | null
          shop_id: string | null
          sort_order: number
        }
        Insert: {
          acuity_type_id?: number | null
          addon_ids?: number[] | null
          barber_id?: string | null
          category?: string | null
          color?: string | null
          description?: string | null
          duration_minutes: number
          form_ids?: number[] | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_public?: boolean
          last_synced_at?: string
          locally_edited?: boolean
          name: string
          padding_after_minutes?: number
          padding_before_minutes?: number
          price_cents: number
          scheduling_url?: string | null
          shop_id?: string | null
          sort_order?: number
        }
        Update: {
          acuity_type_id?: number | null
          addon_ids?: number[] | null
          barber_id?: string | null
          category?: string | null
          color?: string | null
          description?: string | null
          duration_minutes?: number
          form_ids?: number[] | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_public?: boolean
          last_synced_at?: string
          locally_edited?: boolean
          name?: string
          padding_after_minutes?: number
          padding_before_minutes?: number
          price_cents?: number
          scheduling_url?: string | null
          shop_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_hostnames: {
        Row: {
          created_at: string
          hostname: string
          id: string
          is_primary: boolean
          shop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hostname: string
          id?: string
          is_primary?: boolean
          shop_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hostname?: string
          id?: string
          is_primary?: boolean
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_hostnames_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_hours: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          shop_id: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          shop_id?: string | null
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          shop_id?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_hours_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_media_assets: {
        Row: {
          created_at: string
          folder_id: string
          height: number | null
          id: string
          mime_type: string | null
          shop_id: string | null
          size_bytes: number | null
          sort_order: number
          storage_path: string
          title: string | null
          updated_at: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          folder_id: string
          height?: number | null
          id?: string
          mime_type?: string | null
          shop_id?: string | null
          size_bytes?: number | null
          sort_order?: number
          storage_path: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          folder_id?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          shop_id?: string | null
          size_bytes?: number | null
          sort_order?: number
          storage_path?: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_media_assets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "shop_media_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_media_assets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_media_folders: {
        Row: {
          created_at: string
          description_en: string | null
          description_es: string | null
          id: string
          is_public_to_barbers: boolean
          name_en: string
          name_es: string
          shop_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          id?: string
          is_public_to_barbers?: boolean
          name_en: string
          name_es: string
          shop_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          id?: string
          is_public_to_barbers?: boolean
          name_en?: string
          name_es?: string
          shop_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_media_folders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_memberships: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          role: Database["public"]["Enums"]["app_role"]
          shop_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role: Database["public"]["Enums"]["app_role"]
          shop_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          shop_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_memberships_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          address: string | null
          barber_leaderboard_enabled: boolean
          city: string
          created_at: string
          digital_fee_rate: number
          draft_header_logo_url: string | null
          draft_hero_image_url: string | null
          draft_home_grid_photos: string[] | null
          draft_sidebar_logo_url: string | null
          draft_site_content: Json | null
          email: string | null
          fixed_weekly_expenses_cents: number
          header_logo_url: string | null
          hero_image_url: string | null
          home_grid_photos: string[]
          hours: string | null
          id: string
          legal_entity: string
          maps_url: string | null
          min_cash_reserve_cents: number
          notifications_paused_snapshot: Json | null
          owner_name: string
          phone: string | null
          shop_id: string | null
          shop_name: string
          sidebar_logo_url: string | null
          site_content: Json
          tax_reserve_rate: number
          timezone: string
          updated_at: string
          whatsapp: string | null
          yvette_min_surplus_cents: number
          yvette_weekly_cap_cents: number
        }
        Insert: {
          address?: string | null
          barber_leaderboard_enabled?: boolean
          city?: string
          created_at?: string
          digital_fee_rate?: number
          draft_header_logo_url?: string | null
          draft_hero_image_url?: string | null
          draft_home_grid_photos?: string[] | null
          draft_sidebar_logo_url?: string | null
          draft_site_content?: Json | null
          email?: string | null
          fixed_weekly_expenses_cents?: number
          header_logo_url?: string | null
          hero_image_url?: string | null
          home_grid_photos?: string[]
          hours?: string | null
          id?: string
          legal_entity?: string
          maps_url?: string | null
          min_cash_reserve_cents?: number
          notifications_paused_snapshot?: Json | null
          owner_name?: string
          phone?: string | null
          shop_id?: string | null
          shop_name?: string
          sidebar_logo_url?: string | null
          site_content?: Json
          tax_reserve_rate?: number
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
          yvette_min_surplus_cents?: number
          yvette_weekly_cap_cents?: number
        }
        Update: {
          address?: string | null
          barber_leaderboard_enabled?: boolean
          city?: string
          created_at?: string
          digital_fee_rate?: number
          draft_header_logo_url?: string | null
          draft_hero_image_url?: string | null
          draft_home_grid_photos?: string[] | null
          draft_sidebar_logo_url?: string | null
          draft_site_content?: Json | null
          email?: string | null
          fixed_weekly_expenses_cents?: number
          header_logo_url?: string | null
          hero_image_url?: string | null
          home_grid_photos?: string[]
          hours?: string | null
          id?: string
          legal_entity?: string
          maps_url?: string | null
          min_cash_reserve_cents?: number
          notifications_paused_snapshot?: Json | null
          owner_name?: string
          phone?: string | null
          shop_id?: string | null
          shop_name?: string
          sidebar_logo_url?: string | null
          site_content?: Json
          tax_reserve_rate?: number
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
          yvette_min_surplus_cents?: number
          yvette_weekly_cap_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          acuity_enabled: boolean
          booking_provider: string
          created_at: string
          external_booking_url: string | null
          features: Json
          id: string
          is_active: boolean
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          acuity_enabled?: boolean
          booking_provider?: string
          created_at?: string
          external_booking_url?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          acuity_enabled?: boolean
          booking_provider?: string
          created_at?: string
          external_booking_url?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      super_admins: {
        Row: {
          granted_at: string
          notes: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      transaction_items: {
        Row: {
          id: string
          item_id: string | null
          item_type: string
          name: string
          quantity: number
          shop_id: string | null
          total_cents: number
          transaction_id: string
          unit_price_cents: number
        }
        Insert: {
          id?: string
          item_id?: string | null
          item_type: string
          name: string
          quantity?: number
          shop_id?: string | null
          total_cents: number
          transaction_id: string
          unit_price_cents: number
        }
        Update: {
          id?: string
          item_id?: string | null
          item_type?: string
          name?: string
          quantity?: number
          shop_id?: string | null
          total_cents?: number
          transaction_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          allocation_method: string | null
          appointment_id: string | null
          approved_at: string | null
          approved_by_name: string | null
          approved_by_user_id: string | null
          ath_reference_number: string | null
          athmovil_transaction_id: string | null
          barber_id: string | null
          client_id: string | null
          commission_barber_id: string | null
          created_at: string
          dispute_id: string | null
          gateway_fee_cents: number
          id: string
          is_manual_entry: boolean
          notes: string | null
          payment_method: string
          paypal_order_id: string | null
          receipt_sent: boolean
          refund_amount_cents: number | null
          refund_initiated_at: string | null
          refund_reference: string | null
          refund_status: string | null
          refunded_at: string | null
          shop_id: string | null
          source: string
          status: string
          stripe_payment_id: string | null
          stripe_payment_method_type: string | null
          subtotal_cents: number
          tip_cents: number
          total_cents: number
          type: string
        }
        Insert: {
          allocation_method?: string | null
          appointment_id?: string | null
          approved_at?: string | null
          approved_by_name?: string | null
          approved_by_user_id?: string | null
          ath_reference_number?: string | null
          athmovil_transaction_id?: string | null
          barber_id?: string | null
          client_id?: string | null
          commission_barber_id?: string | null
          created_at?: string
          dispute_id?: string | null
          gateway_fee_cents?: number
          id?: string
          is_manual_entry?: boolean
          notes?: string | null
          payment_method: string
          paypal_order_id?: string | null
          receipt_sent?: boolean
          refund_amount_cents?: number | null
          refund_initiated_at?: string | null
          refund_reference?: string | null
          refund_status?: string | null
          refunded_at?: string | null
          shop_id?: string | null
          source?: string
          status?: string
          stripe_payment_id?: string | null
          stripe_payment_method_type?: string | null
          subtotal_cents: number
          tip_cents?: number
          total_cents: number
          type: string
        }
        Update: {
          allocation_method?: string | null
          appointment_id?: string | null
          approved_at?: string | null
          approved_by_name?: string | null
          approved_by_user_id?: string | null
          ath_reference_number?: string | null
          athmovil_transaction_id?: string | null
          barber_id?: string | null
          client_id?: string | null
          commission_barber_id?: string | null
          created_at?: string
          dispute_id?: string | null
          gateway_fee_cents?: number
          id?: string
          is_manual_entry?: boolean
          notes?: string | null
          payment_method?: string
          paypal_order_id?: string | null
          receipt_sent?: boolean
          refund_amount_cents?: number | null
          refund_initiated_at?: string | null
          refund_reference?: string | null
          refund_status?: string | null
          refunded_at?: string | null
          shop_id?: string | null
          source?: string
          status?: string
          stripe_payment_id?: string | null
          stripe_payment_method_type?: string | null
          subtotal_cents?: number
          tip_cents?: number
          total_cents?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_commission_barber_id_fkey"
            columns: ["commission_barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      trusted_devices: {
        Row: {
          created_at: string
          device_fingerprint: string
          id: string
          trusted_until: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          id?: string
          trusted_until: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          id?: string
          trusted_until?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          id: string
          language: string
          theme: string
          updated_at: string
        }
        Insert: {
          id: string
          language?: string
          theme?: string
          updated_at?: string
        }
        Update: {
          id?: string
          language?: string
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          appointment_id: string | null
          barber_id: string | null
          cancelled_at: string | null
          client_id: string | null
          created_at: string
          first_name: string
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          requested_at: string
          seated_at: string | null
          service_duration_minutes: number
          service_name: string
          shop_id: string | null
          status: string
        }
        Insert: {
          appointment_id?: string | null
          barber_id?: string | null
          cancelled_at?: string | null
          client_id?: string | null
          created_at?: string
          first_name: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          requested_at?: string
          seated_at?: string | null
          service_duration_minutes?: number
          service_name: string
          shop_id?: string | null
          status?: string
        }
        Update: {
          appointment_id?: string | null
          barber_id?: string | null
          cancelled_at?: string | null
          client_id?: string | null
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          requested_at?: string
          seated_at?: string | null
          service_duration_minutes?: number
          service_name?: string
          shop_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_members: {
        Row: {
          client_id: string
          code: string
          code_redeemed_at: string | null
          enrolled_at: string
          id: string
          member_number: number
          push_confirmed_at: string | null
          pwa_install_confirmed_at: string | null
          shop_id: string | null
        }
        Insert: {
          client_id: string
          code?: string
          code_redeemed_at?: string | null
          enrolled_at?: string
          id?: string
          member_number: number
          push_confirmed_at?: string | null
          pwa_install_confirmed_at?: string | null
          shop_id?: string | null
        }
        Update: {
          client_id?: string
          code?: string
          code_redeemed_at?: string | null
          enrolled_at?: string
          id?: string
          member_number?: number
          push_confirmed_at?: string | null
          pwa_install_confirmed_at?: string | null
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          created_at: string
          id: string
          type: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          created_at?: string
          id?: string
          type: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          created_at?: string
          id?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          created_at: string
          credential_id: string
          device_name: string | null
          id: string
          public_key: string
          sign_count: number
          transports: string[] | null
          user_id: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          device_name?: string | null
          id?: string
          public_key: string
          sign_count?: number
          transports?: string[] | null
          user_id: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          device_name?: string | null
          id?: string
          public_key?: string
          sign_count?: number
          transports?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      working_hours: {
        Row: {
          barber_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          shop_id: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          barber_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          shop_id?: string | null
          start_time: string
          updated_at?: string
        }
        Update: {
          barber_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          shop_id?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "working_hours_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "working_hours_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      acuity_independence_summary: {
        Row: {
          avg_confidence: number | null
          independence_score: number | null
          total_mapped: number | null
          total_superseded: number | null
          total_unknown: number | null
          total_webhooks: number | null
        }
        Relationships: []
      }
      clients_staff_safe: {
        Row: {
          account_verified: boolean | null
          acuity_client_id: number | null
          avatar_url: string | null
          booking_source: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          first_name: string | null
          gender: string | null
          id: string | null
          is_guest: boolean | null
          last_name: string | null
          last_visit_at: string | null
          notes: string | null
          phone: string | null
          preferred_barber_id: string | null
          total_spent_cents: number | null
          total_visits: number | null
          updated_at: string | null
        }
        Insert: {
          account_verified?: boolean | null
          acuity_client_id?: number | null
          avatar_url?: string | null
          booking_source?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string | null
          is_guest?: boolean | null
          last_name?: string | null
          last_visit_at?: string | null
          notes?: string | null
          phone?: string | null
          preferred_barber_id?: string | null
          total_spent_cents?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Update: {
          account_verified?: boolean | null
          acuity_client_id?: number | null
          avatar_url?: string | null
          booking_source?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string | null
          is_guest?: boolean | null
          last_name?: string | null
          last_visit_at?: string | null
          notes?: string | null
          phone?: string | null
          preferred_barber_id?: string | null
          total_spent_cents?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_preferred_barber_id_fkey"
            columns: ["preferred_barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sales: {
        Row: {
          barber_id: string | null
          barber_name: string | null
          client_id: string | null
          commission_cents: number | null
          cost_cents: number | null
          created_at: string | null
          eligible_for_commission: boolean | null
          item_id: string | null
          payment_method: string | null
          product_id: string | null
          product_name: string | null
          profit_cents: number | null
          quantity: number | null
          revenue_cents: number | null
          source: string | null
          transaction_id: string | null
          unit_price_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_leaderboard: {
        Row: {
          code: string | null
          first_bookings: number | null
          last_conversion_at: string | null
          owner_id: string | null
          owner_type: string | null
          push_enabled: number | null
          pwa_installs: number | null
          signups: number | null
          total_conversions: number | null
          unique_clients: number | null
          waitlist_joins: number | null
        }
        Relationships: []
      }
      reviews_public: {
        Row: {
          barber_id: string | null
          comment: string | null
          created_at: string | null
          id: string | null
          is_published: boolean | null
          rating: number | null
        }
        Insert: {
          barber_id?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string | null
          is_published?: boolean | null
          rating?: number | null
        }
        Update: {
          barber_id?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string | null
          is_published?: boolean | null
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings_public: {
        Row: {
          address: string | null
          barber_leaderboard_enabled: boolean | null
          city: string | null
          created_at: string | null
          draft_header_logo_url: string | null
          draft_hero_image_url: string | null
          draft_home_grid_photos: string[] | null
          draft_sidebar_logo_url: string | null
          draft_site_content: Json | null
          email: string | null
          header_logo_url: string | null
          hero_image_url: string | null
          home_grid_photos: string[] | null
          hours: string | null
          id: string | null
          legal_entity: string | null
          maps_url: string | null
          owner_name: string | null
          phone: string | null
          shop_id: string | null
          shop_name: string | null
          sidebar_logo_url: string | null
          site_content: Json | null
          timezone: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      v_referral_attributions: {
        Row: {
          attribution_status: string | null
          client_id: string | null
          created_at: string | null
          current_referral_owner_id: string | null
          id: string | null
          last_payment_at: string | null
          network_type: string | null
          original_referral_link_id: string | null
          original_referral_owner_id: string | null
          reallocated_at: string | null
          reallocation_reason: string | null
          referrer_display_name: string | null
          referrer_owner_profile_id: string | null
          referrer_owner_type: string | null
          referrer_slug: string | null
          reset_available_at: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_referral_attributions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_referral_attributions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_referral_attributions_current_referral_owner_id_fkey"
            columns: ["current_referral_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_referral_attributions_original_referral_link_id_fkey"
            columns: ["original_referral_link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_referral_attributions_original_referral_owner_id_fkey"
            columns: ["original_referral_owner_id"]
            isOneToOne: false
            referencedRelation: "referral_owners"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _gen_benefit_code: { Args: never; Returns: string }
      acquire_booking_hold: {
        Args: {
          _barber_id: string
          _draft_id: string
          _ends_at: string
          _hold_minutes?: number
          _starts_at: string
        }
        Returns: Json
      }
      admin_adjust_client_rewards: {
        Args: { _client_id: string; _points: number; _reason: string }
        Returns: string
      }
      admin_update_referral_slug: {
        Args: {
          _new_slug: string
          _owner_id: string
          _owner_type: string
          _reason?: string
        }
        Returns: Json
      }
      apply_benefit_code: {
        Args: { _appointment_id: string; _code: string }
        Returns: Json
      }
      apply_benefit_code_to_draft: {
        Args: { _code: string; _draft_id: string }
        Returns: Json
      }
      assert_duplicate_review_admin: {
        Args: { _shop: string }
        Returns: undefined
      }
      assign_client_referral: {
        Args: { _client_id: string; _link_id?: string; _slug: string }
        Returns: string
      }
      attribute_booking_referral: {
        Args: { _appointment_id: string; _ref_code: string }
        Returns: string
      }
      calc_reward_points: { Args: { _cents: number }; Returns: number }
      calculate_referral_production: {
        Args: { _end_at?: string; _start_at?: string; _window?: string }
        Returns: {
          display_name: string
          owner_type: string
          payment_count: number
          production_cents: number
          rank_name_en: string
          rank_name_es: string
          rank_sort_order: number
          referral_owner_id: string
          refund_cents: number
          slug: string
        }[]
      }
      check_rate_limit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: Json
      }
      check_referral_resets: { Args: never; Returns: number }
      check_referral_slug_available: {
        Args: { _exclude_client_id?: string; _slug: string }
        Returns: Json
      }
      check_signup_email_status: { Args: { _email: string }; Returns: Json }
      claim_appointment_by_acuity_id: {
        Args: { _acuity_id: number }
        Returns: string
      }
      claim_benefit: { Args: { _benefit_id: string }; Returns: Json }
      cleanup_expired_challenges: { Args: never; Returns: undefined }
      compute_rewards_eligibility: {
        Args: { _booking_source: string; _client_id: string }
        Returns: Json
      }
      create_referral_pending_match: {
        Args: { _ref_slug: string; _referred_client_id: string }
        Returns: string
      }
      current_shop_id: { Args: { _user_id?: string }; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      deactivate_referral_owner: { Args: { _owner_id: string }; Returns: Json }
      decrement_stock_bulk: { Args: { p_items: Json }; Returns: Json }
      delete_client_safely: { Args: { _client_id: string }; Returns: Json }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_empty_duplicate_profile: {
        Args: { _id: string }
        Returns: undefined
      }
      discard_website_draft: { Args: never; Returns: undefined }
      duplicate_client_dependencies: {
        Args: { _id: string }
        Returns: string[]
      }
      duplicate_review_fingerprint: {
        Args: { _ids: string[] }
        Returns: string
      }
      edit_duplicate_review_profile: {
        Args: {
          _email: string
          _first: string
          _id: string
          _last: string
          _phone: string
        }
        Returns: undefined
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_ghl_event: {
        Args: { _appointment_id: string; _event_type: string }
        Returns: undefined
      }
      ensure_client_referral_owner: {
        Args: { _client_id: string }
        Returns: string
      }
      expire_pending_benefit_redemptions: { Args: never; Returns: number }
      find_client_by_identity: {
        Args: { _email?: string; _phone?: string }
        Returns: string
      }
      find_client_by_name_phone: {
        Args: { _first: string; _last: string; _phone: string }
        Returns: string
      }
      find_client_by_phone: { Args: { _phone: string }; Returns: string }
      find_duplicate_client_groups: {
        Args: never
        Returns: {
          client_count: number
          client_ids: string[]
          group_key: string
          match_type: string
        }[]
      }
      find_matching_client: {
        Args: { _email: string; _phone: string }
        Returns: {
          client_id: string
          display_name: string
          email: string
          match_type: string
          phone: string
        }[]
      }
      find_reclaimable_auth_user: { Args: { _email: string }; Returns: Json }
      generate_client_referral_slug: {
        Args: { _client_id: string; _first_name: string }
        Returns: string
      }
      get_active_benefit_voucher: {
        Args: { _client_id?: string }
        Returns: Json
      }
      get_barbers_payroll: {
        Args: never
        Returns: {
          bonus_threshold_cents: number
          color: string
          commission_rate: number
          employee_id: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          id: string
          is_active: boolean
          name: string
          retention_rate: number
          ssn_last4: string
          weekly_salary: number
        }[]
      }
      get_barbers_safe: {
        Args: never
        Returns: {
          acuity_calendar_id: number
          avatar_url: string
          color: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_default_checkout_barber: boolean
          name: string
          show_in_checkout: boolean
        }[]
      }
      get_busy_intervals: {
        Args: { _barber_id: string; _window_end: string; _window_start: string }
        Returns: {
          ends_at: string
          starts_at: string
        }[]
      }
      get_client_network_dashboard: { Args: never; Returns: Json }
      get_client_network_overview: { Args: never; Returns: Json }
      get_client_payment_details: {
        Args: { _client_id: string }
        Returns: {
          card_brand: string
          card_last4: string
          preferred_payment_method: string
          stripe_customer_id: string
        }[]
      }
      get_client_referral_network: {
        Args: { _client_id: string }
        Returns: Json
      }
      get_client_rewards_profile: {
        Args: { _client_id: string }
        Returns: Json
      }
      get_client_rewards_summary: {
        Args: { _client_id?: string }
        Returns: Json
      }
      get_clients_barber_safe: {
        Args: never
        Returns: {
          acuity_client_id: number
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          last_visit_at: string
          phone: string
          preferred_barber_id: string
          sms_opt_in: boolean
          total_visits: number
          updated_at: string
        }[]
      }
      get_duplicate_review_fingerprint: {
        Args: { _ids: string[] }
        Returns: string
      }
      get_duplicate_review_profiles: { Args: { _ids: string[] }; Returns: Json }
      get_home_expense_context: {
        Args: never
        Returns: {
          fixed_weekly_expenses_cents: number
          recurring_source: string
          shop_id: string
        }[]
      }
      get_home_grid_photos: { Args: never; Returns: string[] }
      get_internal_job_secret: { Args: never; Returns: string }
      get_internal_network_kpis: {
        Args: never
        Returns: {
          active_links_count: number
          attributed_clients_count: number
          near_reset_count: number
          pending_validation_count: number
          total_production_cents: number
        }[]
      }
      get_my_barber_appointments_safe: {
        Args: never
        Returns: {
          acuity_client_id: number
          acuity_id: number
          addons: string[]
          barber_id: string
          cancelled_at: string
          cancelled_by_role: string
          client_email: string
          client_id: string
          client_name: string
          client_phone: string
          created_at: string
          created_by_role: string
          created_by_user_id: string
          duration_minutes: number
          ends_at: string
          id: string
          is_recurring: boolean
          label: string
          last_pushed_at: string
          notes: string
          price_cents: number
          recurring_group_id: string
          service_id: number
          service_name: string
          starts_at: string
          status: string
          updated_at: string
        }[]
      }
      get_my_barber_id: { Args: never; Returns: string }
      get_my_client_id: { Args: never; Returns: string }
      get_next_check_number: { Args: never; Returns: number }
      get_pending_badge_counts: {
        Args: never
        Returns: {
          contact_count: number
          duplicate_count: number
          pending_review_count: number
          recruitment_count: number
        }[]
      }
      get_publication_settings_public: {
        Args: never
        Returns: {
          author_avatar_url: string
          author_bio_en: string
          author_bio_es: string
          author_first_name: string
          author_last_name: string
          author_role_en: string
          author_role_es: string
          id: string
          share_copy_enabled: boolean
          share_email_enabled: boolean
          share_facebook_enabled: boolean
          share_instagram_enabled: boolean
          share_linkedin_enabled: boolean
          share_threads_enabled: boolean
          share_whatsapp_enabled: boolean
          share_x_enabled: boolean
          share_youtube_enabled: boolean
          social_bluesky: string
          social_discord: string
          social_facebook: string
          social_instagram: string
          social_linkedin: string
          social_rss: string
          social_threads: string
          social_tiktok: string
          social_whatsapp: string
          social_x: string
          social_youtube: string
        }[]
      }
      get_push_subscribers: {
        Args: never
        Returns: {
          avatar_url: string
          client_id: string
          created_at: string
          email: string
          endpoint: string
          failure_count: number
          first_name: string
          language: string
          last_name: string
          last_used_at: string
          phone: string
          subscription_id: string
          user_agent: string
        }[]
      }
      get_referral_code_owner: {
        Args: { _code: string }
        Returns: {
          code: string
          created_at: string
          is_active: boolean
          owner_id: string
          owner_type: string
        }[]
      }
      get_referral_links_overview: { Args: never; Returns: Json }
      get_referral_owner_display_name: {
        Args: { _slug: string }
        Returns: string
      }
      get_referral_performance: {
        Args: never
        Returns: {
          code: string
          first_bookings: number
          last_conversion_at: string
          ltv_cents: number
          owner_id: string
          owner_name: string
          owner_type: string
          push_enabled: number
          pwa_installs: number
          signups: number
          total_conversions: number
          unique_clients: number
          waitlist_joins: number
        }[]
      }
      get_shop_financial_config: {
        Args: never
        Returns: {
          digital_fee_rate: number
          fixed_weekly_expenses_cents: number
          notifications_paused_snapshot: Json
          yvette_min_surplus_cents: number
          yvette_weekly_cap_cents: number
        }[]
      }
      get_shop_settings_safe: {
        Args: never
        Returns: {
          address: string
          email: string
          phone: string
          shop_name: string
          timezone: string
        }[]
      }
      grant_birthday_gifts_today: {
        Args: never
        Returns: {
          code: string
          first_name: string
          out_client_id: string
          redemption_id: string
        }[]
      }
      grant_launch_bonus_for_active_pwa_clients: {
        Args: { _lookback_days?: number }
        Returns: {
          appointment_id: string
          client_id: string
          points_granted: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_shop_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _shop_id: string
          _user_id?: string
        }
        Returns: boolean
      }
      increment_blog_view: { Args: { _post_id: string }; Returns: undefined }
      is_barber: { Args: never; Returns: boolean }
      is_client: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_shop_member: {
        Args: { _shop_id: string; _user_id?: string }
        Returns: boolean
      }
      is_slug_reserved: { Args: { _slug: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_valid_slug_format: { Args: { _slug: string }; Returns: boolean }
      link_or_create_client_for_signup: {
        Args: {
          _booking_source?: string
          _email: string
          _first_name?: string
          _last_name?: string
          _phone?: string
        }
        Returns: Json
      }
      merge_clients: {
        Args: { _discard_id: string; _keep_id: string }
        Returns: Json
      }
      merge_duplicate_review_pair: {
        Args: { _discard_id: string; _keep_id: string }
        Returns: Json
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_shop_ids: { Args: never; Returns: string[] }
      normalize_email: { Args: { _email: string }; Returns: string }
      normalize_phone: { Args: { _phone: string }; Returns: string }
      outreach_affinities: {
        Args: never
        Returns: {
          barber_id: string
          client_id: string
        }[]
      }
      outreach_affinity_barber: {
        Args: { p_client_id: string }
        Returns: string
      }
      outreach_can_access_client: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      outreach_copy_history: {
        Args: { p_since: string }
        Returns: {
          action: string
          actor_barber_id: string
          actor_name: string
          actor_user_id: string
          client_id: string
          copied_at: string
          id: string
        }[]
      }
      outreach_credits: {
        Args: { p_end: string; p_start: string }
        Returns: {
          actor_barber_id: string
          actor_name: string
          actor_user_id: string
          appointment_barber_id: string
          appointment_created_at: string
          appointment_id: string
          appointment_starts_at: string
          client_id: string
          copied_at: string
          copy_id: string
        }[]
      }
      owner_purge_all_cancelled_unpaid: { Args: never; Returns: Json }
      owner_purge_nonrecurring_over_recurring: {
        Args: {
          _dry_run?: boolean
          _from?: string
          _reason?: string
          _to?: string
        }
        Returns: Json
      }
      owner_set_overlap_exempt: {
        Args: { _appointment_id: string; _exempt?: boolean; _reason: string }
        Returns: undefined
      }
      payroll_week_closed: { Args: { _starts_at: string }; Returns: boolean }
      publish_website_draft: { Args: never; Returns: undefined }
      purge_deleted_client_appointments: { Args: never; Returns: Json }
      purge_stale_booking_drafts: { Args: never; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_matching_bonus_for_client: {
        Args: { _client_id: string }
        Returns: number
      }
      record_duplicate_review_decision: {
        Args: { _decision: string; _fingerprint: string; _ids: string[] }
        Returns: undefined
      }
      record_outreach_copy: {
        Args: { p_action?: string; p_client_id: string }
        Returns: {
          copied_at: string
          id: string
          previous_actor_name: string
          previous_copied_at: string
        }[]
      }
      record_referral_conversion:
        | {
            Args: {
              _client_id?: string
              _code: string
              _conversion_type: string
              _landing_url?: string
              _utm_campaign?: string
              _utm_medium?: string
              _utm_source?: string
            }
            Returns: string
          }
        | {
            Args: {
              _appointment_id?: string
              _client_id?: string
              _code: string
              _conversion_type: string
              _landing_url?: string
              _utm_campaign?: string
              _utm_medium?: string
              _utm_source?: string
            }
            Returns: string
          }
      record_stripe_appointment_payment: {
        Args: {
          p_amount_cents: number
          p_appointment_id: string
          p_method_type?: string
          p_payment_intent_id: string
          p_tip_cents: number
        }
        Returns: Json
      }
      redeem_benefit_code: {
        Args: {
          _appointment_id: string
          _code: string
          _transaction_id?: string
        }
        Returns: Json
      }
      release_booking_hold: {
        Args: { _draft_id: string; _final_status?: string }
        Returns: undefined
      }
      relink_appointment: {
        Args: { _appt_id: string; _target_client_id: string }
        Returns: Json
      }
      remove_benefit_code_from_draft: {
        Args: { _draft_id: string }
        Returns: Json
      }
      resolve_referral_slug: { Args: { _slug: string }; Returns: string }
      resolve_shop_by_acuity_calendar_id: {
        Args: { _calendar_id: string }
        Returns: string
      }
      resolve_shop_by_host: { Args: { _host: string }; Returns: string }
      resolve_shop_by_slug: { Args: { _slug: string }; Returns: string }
      resolve_single_active_shop: { Args: never; Returns: string }
      restore_stock_bulk: { Args: { p_items: Json }; Returns: undefined }
      set_client_birthday: {
        Args: {
          _appointment_id?: string
          _client_id: string
          _date_of_birth: string
        }
        Returns: string
      }
      shop_is_acuity_enabled: { Args: { _shop_id: string }; Returns: boolean }
      staff_cancel_paid_appointment: {
        Args: { _appointment_id: string; _reason?: string }
        Returns: Json
      }
      staff_hard_delete_appointment: {
        Args: { _appointment_id: string; _reason?: string }
        Returns: Json
      }
      staff_hard_delete_appointments_bulk: {
        Args: { _appointment_ids: string[]; _reason?: string }
        Returns: Json
      }
      staff_preauthorize_overlap: {
        Args: { _acuity_id: number; _reason?: string }
        Returns: undefined
      }
      staff_purge_cancelled_appointments: {
        Args: { _only_unpaid?: boolean }
        Returns: Json
      }
      staff_record_created_appointment: {
        Args: {
          _acuity_id: number
          _addons: string[]
          _barber_id: string
          _client_email: string
          _client_id: string
          _client_name: string
          _client_phone: string
          _duration_minutes: number
          _ends_at: string
          _is_recurring: boolean
          _price_cents: number
          _recurring_group_id: string
          _service_id: number
          _service_name: string
          _starts_at: string
        }
        Returns: string
      }
      staff_upsert_appointment_overlap_override: {
        Args: { _appt: Json; _reason: string }
        Returns: string
      }
      update_client_referral_slug: {
        Args: { _new_slug: string }
        Returns: Json
      }
      verify_internal_job_secret: {
        Args: { _secret: string }
        Returns: boolean
      }
      webhook_hard_delete_appointment: {
        Args: { _appointment_id: string; _reason?: string }
        Returns: Json
      }
      website_draft_assets: { Args: never; Returns: Json }
      website_draft_status: { Args: never; Returns: Json }
    }
    Enums: {
      app_role:
        | "owner"
        | "barber"
        | "client"
        | "super_owner"
        | "manager"
        | "staff"
      checklist_status: "pending" | "in_review" | "done" | "blocked"
      employment_type: "w2_fixed" | "commission" | "w2_variable"
      submission_status: "new" | "read" | "archived"
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
  public: {
    Enums: {
      app_role: [
        "owner",
        "barber",
        "client",
        "super_owner",
        "manager",
        "staff",
      ],
      checklist_status: ["pending", "in_review", "done", "blocked"],
      employment_type: ["w2_fixed", "commission", "w2_variable"],
      submission_status: ["new", "read", "archived"],
    },
  },
} as const
