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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_usage_logs: {
        Row: {
          api_calls: number | null
          api_provider: string
          created_at: string | null
          edge_function: string
          id: string
          input_tokens: number | null
          metadata: Json | null
          model: string | null
          output_tokens: number | null
          tokens_used: number | null
          total_tokens: number | null
        }
        Insert: {
          api_calls?: number | null
          api_provider: string
          created_at?: string | null
          edge_function: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          tokens_used?: number | null
          total_tokens?: number | null
        }
        Update: {
          api_calls?: number | null
          api_provider?: string
          created_at?: string | null
          edge_function?: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          tokens_used?: number | null
          total_tokens?: number | null
        }
        Relationships: []
      }
      aski_chats: {
        Row: {
          created_at: string | null
          id: string
          is_archived: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      aski_memory: {
        Row: {
          category: string
          confidence: number
          created_at: string
          expires_at: string
          id: string
          insight: string
          is_active: boolean
          last_confirmed_at: string
          source_chat_ids: string[]
          updated_at: string
        }
        Insert: {
          category: string
          confidence?: number
          created_at?: string
          expires_at?: string
          id?: string
          insight: string
          is_active?: boolean
          last_confirmed_at?: string
          source_chat_ids?: string[]
          updated_at?: string
        }
        Update: {
          category?: string
          confidence?: number
          created_at?: string
          expires_at?: string
          id?: string
          insight?: string
          is_active?: boolean
          last_confirmed_at?: string
          source_chat_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      aski_messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string | null
          id: string
          response_time_ms: number | null
          role: string
          tokens_used: number | null
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string | null
          id?: string
          response_time_ms?: number | null
          role: string
          tokens_used?: number | null
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string | null
          id?: string
          response_time_ms?: number | null
          role?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aski_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "aski_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      client_plan: {
        Row: {
          aski_limit: number
          billing_cycle: string
          created_at: string
          id: string
          plan: string
          project_id: string
          recos_monthly_limit: number
          sessions_limit: number
          updated_at: string
        }
        Insert: {
          aski_limit?: number
          billing_cycle?: string
          created_at?: string
          id?: string
          plan?: string
          project_id: string
          recos_monthly_limit?: number
          sessions_limit?: number
          updated_at?: string
        }
        Update: {
          aski_limit?: number
          billing_cycle?: string
          created_at?: string
          id?: string
          plan?: string
          project_id?: string
          recos_monthly_limit?: number
          sessions_limit?: number
          updated_at?: string
        }
        Relationships: []
      }
      diagnostic_items: {
        Row: {
          created_at: string | null
          dynamic_answer_1: string | null
          dynamic_answer_2: string | null
          dynamic_answer_3: string | null
          dynamic_insight_targets: string | null
          dynamic_question_1: string | null
          dynamic_question_2: string | null
          dynamic_question_3: string | null
          id: string
          item_index: number
          item_label: string | null
          item_metadata: Json | null
          session_id: string
        }
        Insert: {
          created_at?: string | null
          dynamic_answer_1?: string | null
          dynamic_answer_2?: string | null
          dynamic_answer_3?: string | null
          dynamic_insight_targets?: string | null
          dynamic_question_1?: string | null
          dynamic_question_2?: string | null
          dynamic_question_3?: string | null
          id?: string
          item_index: number
          item_label?: string | null
          item_metadata?: Json | null
          session_id: string
        }
        Update: {
          created_at?: string | null
          dynamic_answer_1?: string | null
          dynamic_answer_2?: string | null
          dynamic_answer_3?: string | null
          dynamic_insight_targets?: string | null
          dynamic_question_1?: string | null
          dynamic_question_2?: string | null
          dynamic_question_3?: string | null
          id?: string
          item_index?: number
          item_label?: string | null
          item_metadata?: Json | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_responses: {
        Row: {
          answers: Json | null
          child_age: number | null
          child_name: string | null
          created_at: string | null
          detected_persona: string | null
          email: string | null
          email_optin: boolean | null
          id: string
          metadata: Json | null
          parent_name: string | null
          persona_confidence: number | null
          persona_scores: Json | null
          phone: string | null
          session_id: string
          sms_optin: boolean | null
          source_url: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          answers?: Json | null
          child_age?: number | null
          child_name?: string | null
          created_at?: string | null
          detected_persona?: string | null
          email?: string | null
          email_optin?: boolean | null
          id?: string
          metadata?: Json | null
          parent_name?: string | null
          persona_confidence?: number | null
          persona_scores?: Json | null
          phone?: string | null
          session_id: string
          sms_optin?: boolean | null
          source_url?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          answers?: Json | null
          child_age?: number | null
          child_name?: string | null
          created_at?: string | null
          detected_persona?: string | null
          email?: string | null
          email_optin?: boolean | null
          id?: string
          metadata?: Json | null
          parent_name?: string | null
          persona_confidence?: number | null
          persona_scores?: Json | null
          phone?: string | null
          session_id?: string
          sms_optin?: boolean | null
          source_url?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      diagnostic_sessions: {
        Row: {
          abandoned_at_step: string | null
          adapted_tone: string | null
          avg_response_time: number | null
          back_navigation_count: number | null
          behavior_tags: string | null
          cart_selected_at: string | null
          checkout_at: string | null
          checkout_started: boolean
          content_format_preference: string | null
          conversion: boolean | null
          created_at: string | null
          device: string | null
          duration_seconds: number | null
          email: string | null
          engagement_score: number | null
          existing_client_products: string | null
          exit_type: string | null
          has_detailed_responses: boolean | null
          has_optional_details: boolean | null
          id: string
          is_existing_client: boolean | null
          locale: string | null
          matching_score: number | null
          number_of_children: number | null
          optin_email: boolean | null
          optin_sms: boolean | null
          over_quota: boolean | null
          persona_code: string | null
          phone: string | null
          priorities_ordered: string | null
          question_path: string | null
          recommended_cart_amount: number | null
          recommended_products: string | null
          relationship: string | null
          result_url: string | null
          routine_size_preference: string | null
          selected_cart_amount: number | null
          session_code: string
          source: string | null
          status: string
          step_timestamps: Json | null
          total_text_length: number | null
          trust_triggers_ordered: string | null
          upsell_potential: string | null
          user_name: string | null
          utm_campaign: string | null
          validated_cart_amount: number | null
          validated_products: string | null
        }
        Insert: {
          abandoned_at_step?: string | null
          adapted_tone?: string | null
          avg_response_time?: number | null
          back_navigation_count?: number | null
          behavior_tags?: string | null
          cart_selected_at?: string | null
          checkout_at?: string | null
          checkout_started?: boolean
          content_format_preference?: string | null
          conversion?: boolean | null
          created_at?: string | null
          device?: string | null
          duration_seconds?: number | null
          email?: string | null
          engagement_score?: number | null
          existing_client_products?: string | null
          exit_type?: string | null
          has_detailed_responses?: boolean | null
          has_optional_details?: boolean | null
          id?: string
          is_existing_client?: boolean | null
          locale?: string | null
          matching_score?: number | null
          number_of_children?: number | null
          optin_email?: boolean | null
          optin_sms?: boolean | null
          over_quota?: boolean | null
          persona_code?: string | null
          phone?: string | null
          priorities_ordered?: string | null
          question_path?: string | null
          recommended_cart_amount?: number | null
          recommended_products?: string | null
          relationship?: string | null
          result_url?: string | null
          routine_size_preference?: string | null
          selected_cart_amount?: number | null
          session_code: string
          source?: string | null
          status?: string
          step_timestamps?: Json | null
          total_text_length?: number | null
          trust_triggers_ordered?: string | null
          upsell_potential?: string | null
          user_name?: string | null
          utm_campaign?: string | null
          validated_cart_amount?: number | null
          validated_products?: string | null
        }
        Update: {
          abandoned_at_step?: string | null
          adapted_tone?: string | null
          avg_response_time?: number | null
          back_navigation_count?: number | null
          behavior_tags?: string | null
          cart_selected_at?: string | null
          checkout_at?: string | null
          checkout_started?: boolean
          content_format_preference?: string | null
          conversion?: boolean | null
          created_at?: string | null
          device?: string | null
          duration_seconds?: number | null
          email?: string | null
          engagement_score?: number | null
          existing_client_products?: string | null
          exit_type?: string | null
          has_detailed_responses?: boolean | null
          has_optional_details?: boolean | null
          id?: string
          is_existing_client?: boolean | null
          locale?: string | null
          matching_score?: number | null
          number_of_children?: number | null
          optin_email?: boolean | null
          optin_sms?: boolean | null
          over_quota?: boolean | null
          persona_code?: string | null
          phone?: string | null
          priorities_ordered?: string | null
          question_path?: string | null
          recommended_cart_amount?: number | null
          recommended_products?: string | null
          relationship?: string | null
          result_url?: string | null
          routine_size_preference?: string | null
          selected_cart_amount?: number | null
          session_code?: string
          source?: string | null
          status?: string
          step_timestamps?: Json | null
          total_text_length?: number | null
          trust_triggers_ordered?: string | null
          upsell_potential?: string | null
          user_name?: string | null
          utm_campaign?: string | null
          validated_cart_amount?: number | null
          validated_products?: string | null
        }
        Relationships: []
      }
      funnel_recommendations: {
        Row: {
          applied: boolean
          applied_at: string | null
          created_at: string
          id: string
          issue: string
          kept_from_previous: boolean
          recommendation: string
          step: string
          week_start: string
        }
        Insert: {
          applied?: boolean
          applied_at?: string | null
          created_at?: string
          id?: string
          issue: string
          kept_from_previous?: boolean
          recommendation: string
          step: string
          week_start: string
        }
        Update: {
          applied?: boolean
          applied_at?: string | null
          created_at?: string
          id?: string
          issue?: string
          kept_from_previous?: boolean
          recommendation?: string
          step?: string
          week_start?: string
        }
        Relationships: []
      }
      market_intelligence: {
        Row: {
          client_context: Json | null
          created_at: string | null
          error_log: string | null
          gemini_ads_analysis: Json | null
          gemini_email_analysis: Json | null
          gemini_offers_analysis: Json | null
          generation_duration_ms: number | null
          id: string
          models_used: Json | null
          month_year: string
          perplexity_ads: Json | null
          perplexity_email: Json | null
          perplexity_offers: Json | null
          personas_snapshot: Json | null
          project_id: string
          status: string
          updated_at: string | null
          weekly_trends_refresh: Json | null
        }
        Insert: {
          client_context?: Json | null
          created_at?: string | null
          error_log?: string | null
          gemini_ads_analysis?: Json | null
          gemini_email_analysis?: Json | null
          gemini_offers_analysis?: Json | null
          generation_duration_ms?: number | null
          id?: string
          models_used?: Json | null
          month_year: string
          perplexity_ads?: Json | null
          perplexity_email?: Json | null
          perplexity_offers?: Json | null
          personas_snapshot?: Json | null
          project_id?: string
          status?: string
          updated_at?: string | null
          weekly_trends_refresh?: Json | null
        }
        Update: {
          client_context?: Json | null
          created_at?: string | null
          error_log?: string | null
          gemini_ads_analysis?: Json | null
          gemini_email_analysis?: Json | null
          gemini_offers_analysis?: Json | null
          generation_duration_ms?: number | null
          id?: string
          models_used?: Json | null
          month_year?: string
          perplexity_ads?: Json | null
          perplexity_email?: Json | null
          perplexity_offers?: Json | null
          personas_snapshot?: Json | null
          project_id?: string
          status?: string
          updated_at?: string | null
          weekly_trends_refresh?: Json | null
        }
        Relationships: []
      }
      marketing_recommendations: {
        Row: {
          action_status: string
          ads_recommendations: Json | null
          ads_v2: Json
          brief: string | null
          campaigns_overview: Json
          category: string | null
          checklist: Json | null
          completed_at: string | null
          content: Json
          email_recommendations: Json | null
          emails_v2: Json
          feedback_entered_at: string | null
          feedback_notes: string | null
          feedback_results: Json | null
          feedback_score: string | null
          generated_at: string | null
          generated_categories: Json | null
          generation_config: Json
          generation_status: string
          generation_type: string | null
          id: string
          offers_recommendations: Json | null
          offers_v2: Json
          persona_cible: string | null
          persona_code: string | null
          persona_focus: Json | null
          pre_calculated_context: Json | null
          priority: number
          recommendation_version: number
          sources_consulted: Json | null
          sources_inspirations: Json
          status: string | null
          targeting: Json
          title: string | null
          week_start: string
        }
        Insert: {
          action_status?: string
          ads_recommendations?: Json | null
          ads_v2?: Json
          brief?: string | null
          campaigns_overview?: Json
          category?: string | null
          checklist?: Json | null
          completed_at?: string | null
          content?: Json
          email_recommendations?: Json | null
          emails_v2?: Json
          feedback_entered_at?: string | null
          feedback_notes?: string | null
          feedback_results?: Json | null
          feedback_score?: string | null
          generated_at?: string | null
          generated_categories?: Json | null
          generation_config?: Json
          generation_status?: string
          generation_type?: string | null
          id?: string
          offers_recommendations?: Json | null
          offers_v2?: Json
          persona_cible?: string | null
          persona_code?: string | null
          persona_focus?: Json | null
          pre_calculated_context?: Json | null
          priority?: number
          recommendation_version?: number
          sources_consulted?: Json | null
          sources_inspirations?: Json
          status?: string | null
          targeting?: Json
          title?: string | null
          week_start: string
        }
        Update: {
          action_status?: string
          ads_recommendations?: Json | null
          ads_v2?: Json
          brief?: string | null
          campaigns_overview?: Json
          category?: string | null
          checklist?: Json | null
          completed_at?: string | null
          content?: Json
          email_recommendations?: Json | null
          emails_v2?: Json
          feedback_entered_at?: string | null
          feedback_notes?: string | null
          feedback_results?: Json | null
          feedback_score?: string | null
          generated_at?: string | null
          generated_categories?: Json | null
          generation_config?: Json
          generation_status?: string
          generation_type?: string | null
          id?: string
          offers_recommendations?: Json | null
          offers_v2?: Json
          persona_cible?: string | null
          persona_code?: string | null
          persona_focus?: Json | null
          pre_calculated_context?: Json | null
          priority?: number
          recommendation_version?: number
          sources_consulted?: Json | null
          sources_inspirations?: Json
          status?: string | null
          targeting?: Json
          title?: string | null
          week_start?: string
        }
        Relationships: []
      }
      marketing_sources: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          project_id: string
          source_name: string
          source_url: string | null
          tier: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          project_id?: string
          source_name: string
          source_url?: string | null
          tier?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          project_id?: string
          source_name?: string
          source_url?: string | null
          tier?: number | null
        }
        Relationships: []
      }
      client_products: {
        Row: {
          created_at: string | null
          description: string | null
          handle: string
          id: string
          images: Json | null
          price_max: number | null
          price_min: number | null
          product_type: string | null
          published_at: string | null
          shopify_product_id: number
          shopify_url: string | null
          status: string | null
          synced_at: string | null
          tags: string[] | null
          title: string
          variants: Json | null
          vendor: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          handle: string
          id?: string
          images?: Json | null
          price_max?: number | null
          price_min?: number | null
          product_type?: string | null
          published_at?: string | null
          shopify_product_id: number
          shopify_url?: string | null
          status?: string | null
          synced_at?: string | null
          tags?: string[] | null
          title: string
          variants?: Json | null
          vendor?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          handle?: string
          id?: string
          images?: Json | null
          price_max?: number | null
          price_min?: number | null
          product_type?: string | null
          published_at?: string | null
          shopify_product_id?: number
          shopify_url?: string | null
          status?: string | null
          synced_at?: string | null
          tags?: string[] | null
          title?: string
          variants?: Json | null
          vendor?: string | null
        }
        Relationships: []
      }
      persona_detection_log: {
        Row: {
          action_taken: string
          created_at: string | null
          details: Json
          detection_type: string
          id: string
          persona_code_created: string | null
          sessions_affected: number | null
        }
        Insert: {
          action_taken: string
          created_at?: string | null
          details: Json
          detection_type: string
          id?: string
          persona_code_created?: string | null
          sessions_affected?: number | null
        }
        Update: {
          action_taken?: string
          created_at?: string | null
          details?: Json
          detection_type?: string
          id?: string
          persona_code_created?: string | null
          sessions_affected?: number | null
        }
        Relationships: []
      }
      personas: {
        Row: {
          auto_created_at: string | null
          avg_matching_score: number | null
          code: string
          created_at: string | null
          criteria: Json
          description: string | null
          detection_source: string | null
          full_label: string
          id: string
          is_active: boolean | null
          is_auto_created: boolean | null
          is_existing_client_persona: boolean | null
          is_pool: boolean | null
          min_sessions: number | null
          name: string
          session_count: number | null
          source_personas: string[] | null
          updated_at: string | null
        }
        Insert: {
          auto_created_at?: string | null
          avg_matching_score?: number | null
          code: string
          created_at?: string | null
          criteria?: Json
          description?: string | null
          detection_source?: string | null
          full_label: string
          id?: string
          is_active?: boolean | null
          is_auto_created?: boolean | null
          is_existing_client_persona?: boolean | null
          is_pool?: boolean | null
          min_sessions?: number | null
          name: string
          session_count?: number | null
          source_personas?: string[] | null
          updated_at?: string | null
        }
        Update: {
          auto_created_at?: string | null
          avg_matching_score?: number | null
          code?: string
          created_at?: string | null
          criteria?: Json
          description?: string | null
          detection_source?: string | null
          full_label?: string
          id?: string
          is_active?: boolean | null
          is_auto_created?: boolean | null
          is_existing_client_persona?: boolean | null
          is_pool?: boolean | null
          min_sessions?: number | null
          name?: string
          session_count?: number | null
          source_personas?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recommendation_usage: {
        Row: {
          created_at: string | null
          generations_log: Json | null
          id: string
          month_year: string
          monthly_limit: number
          plan: string
          project_id: string
          total_generated: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          generations_log?: Json | null
          id?: string
          month_year: string
          monthly_limit?: number
          plan?: string
          project_id: string
          total_generated?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          generations_log?: Json | null
          id?: string
          month_year?: string
          monthly_limit?: number
          plan?: string
          project_id?: string
          total_generated?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      client_orders: {
        Row: {
          created_at: string | null
          currency: string | null
          customer_email: string | null
          diagnostic_session_id: string | null
          id: string
          is_from_diagnostic: boolean | null
          order_number: string | null
          shopify_order_id: string
          total_price: number | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          diagnostic_session_id?: string | null
          id?: string
          is_from_diagnostic?: boolean | null
          order_number?: string | null
          shopify_order_id: string
          total_price?: number | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          diagnostic_session_id?: string | null
          id?: string
          is_from_diagnostic?: boolean | null
          order_number?: string | null
          shopify_order_id?: string
          total_price?: number | null
        }
        Relationships: []
      }
      tenant_config: {
        Row: {
          brand_description: string | null
          brand_name: string
          brand_tone: string | null
          client_context_json: Json | null
          created_at: string
          currency: string
          dashboard_url: string | null
          diagnostic_url: string | null
          ga4_landing_path: string | null
          id: string
          industry: string | null
          integrations_enabled: Json | null
          klaviyo_list_id: string | null
          locale: string
          meta_pixel_id: string | null
          persona_detection_params: Json | null
          persona_dimension_mapping: Json | null
          project_id: string
          shopify_store_domain: string | null
          target_audience: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          brand_description?: string | null
          brand_name: string
          brand_tone?: string | null
          client_context_json?: Json | null
          created_at?: string
          currency?: string
          dashboard_url?: string | null
          diagnostic_url?: string | null
          ga4_landing_path?: string | null
          id?: string
          industry?: string | null
          integrations_enabled?: Json | null
          klaviyo_list_id?: string | null
          locale?: string
          meta_pixel_id?: string | null
          persona_detection_params?: Json | null
          persona_dimension_mapping?: Json | null
          project_id: string
          shopify_store_domain?: string | null
          target_audience?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          brand_description?: string | null
          brand_name?: string
          brand_tone?: string | null
          client_context_json?: Json | null
          created_at?: string
          currency?: string
          dashboard_url?: string | null
          diagnostic_url?: string | null
          ga4_landing_path?: string | null
          id?: string
          industry?: string | null
          integrations_enabled?: Json | null
          klaviyo_list_id?: string | null
          locale?: string
          meta_pixel_id?: string | null
          persona_detection_params?: Json | null
          persona_dimension_mapping?: Json | null
          project_id?: string
          shopify_store_domain?: string | null
          target_audience?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          aski_conversations_used: number
          id: string
          period_start: string
          period_type: string
          project_id: string
          recos_used: number
          sessions_used: number
          updated_at: string
        }
        Insert: {
          aski_conversations_used?: number
          id?: string
          period_start: string
          period_type: string
          project_id: string
          recos_used?: number
          sessions_used?: number
          updated_at?: string
        }
        Update: {
          aski_conversations_used?: number
          id?: string
          period_start?: string
          period_type?: string
          project_id?: string
          recos_used?: number
          sessions_used?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
