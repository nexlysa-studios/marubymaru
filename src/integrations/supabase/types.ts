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
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          customer_email: string
          customer_name: string
          discount_amount: number
          id: string
          order_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          customer_email: string
          customer_name?: string
          discount_amount: number
          id?: string
          order_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          customer_email?: string
          customer_name?: string
          discount_amount?: number
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          description: string
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          max_uses_per_customer: number
          min_order_amount: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_customer?: number
          min_order_amount?: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_customer?: number
          min_order_amount?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          completed_at: string | null
          coupon_id: string | null
          created_at: string
          due_at: string
          id: string
          kind: string
          last_error: string | null
          snapshot: Json | null
          source_key: string | null
          status: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          coupon_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          kind: string
          last_error?: string | null
          snapshot?: Json | null
          source_key?: string | null
          status?: string
          title: string
        }
        Update: {
          completed_at?: string | null
          coupon_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          snapshot?: Json | null
          source_key?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_deliveries: {
        Row: {
          attempts: number
          campaign_id: string
          delivery_status: string | null
          delivery_updated_at: string | null
          first_attempt_at: string | null
          id: string
          last_error: string | null
          lock_token: string | null
          locked_until: string | null
          next_attempt_at: string
          payload: Json | null
          provider_id: string | null
          sent_at: string | null
          status: string
          subscriber_id: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          delivery_status?: string | null
          delivery_updated_at?: string | null
          first_attempt_at?: string | null
          id?: string
          last_error?: string | null
          lock_token?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          payload?: Json | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          subscriber_id: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          delivery_status?: string | null
          delivery_updated_at?: string | null
          first_attempt_at?: string | null
          id?: string
          last_error?: string | null
          lock_token?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          payload?: Json | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_deliveries_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "newsletter_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_sale_items: {
        Row: {
          campaign_id: string
          product_id: string
          revision: number
        }
        Insert: {
          campaign_id: string
          product_id: string
          revision: number
        }
        Update: {
          campaign_id?: string
          product_id?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_sale_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_rate_limits: {
        Row: {
          attempts: number
          key: string
          window_start: string
        }
        Insert: {
          attempts?: number
          key: string
          window_start?: string
        }
        Update: {
          attempts?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      newsletter_settings: {
        Row: {
          id: boolean
          mailing_address: string
          sending_enabled: boolean
          worker_locked_until: string | null
          worker_token: string | null
        }
        Insert: {
          id?: boolean
          mailing_address?: string
          sending_enabled?: boolean
          worker_locked_until?: string | null
          worker_token?: string | null
        }
        Update: {
          id?: boolean
          mailing_address?: string
          sending_enabled?: boolean
          worker_locked_until?: string | null
          worker_token?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          consent_version: string
          created_at: string
          email: string
          id: string
          source: string
          status: string
          subscribed_at: string
          unsubscribe_token: string
          unsubscribed_at: string | null
        }
        Insert: {
          consent_version?: string
          created_at?: string
          email: string
          id?: string
          source?: string
          status?: string
          subscribed_at?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
        }
        Update: {
          consent_version?: string
          created_at?: string
          email?: string
          id?: string
          source?: string
          status?: string
          subscribed_at?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      order_cancellation_emails: {
        Row: {
          attempts: number
          created_at: string
          first_attempt_at: string | null
          id: string
          last_error: string | null
          lock_token: string | null
          locked_until: string | null
          next_attempt_at: string
          order_id: string
          payload: Json | null
          provider_id: string | null
          recipient: string | null
          sent_at: string | null
          snapshot: Json
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          first_attempt_at?: string | null
          id?: string
          last_error?: string | null
          lock_token?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          order_id: string
          payload?: Json | null
          provider_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          snapshot: Json
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          first_attempt_at?: string | null
          id?: string
          last_error?: string | null
          lock_token?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          order_id?: string
          payload?: Json | null
          provider_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          snapshot?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_cancellation_emails_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_email_events: {
        Row: {
          event_id: string
          occurred_at: string
          provider_id: string
          received_at: string
          status: string
        }
        Insert: {
          event_id: string
          occurred_at: string
          provider_id: string
          received_at?: string
          status: string
        }
        Update: {
          event_id?: string
          occurred_at?: string
          provider_id?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      order_emails: {
        Row: {
          attempts: number
          created_at: string
          delivery_status: string | null
          delivery_updated_at: string | null
          first_attempt_at: string | null
          id: string
          kind: string
          last_error: string | null
          lock_token: string | null
          locked_until: string | null
          next_attempt_at: string
          order_id: string
          payload: Json | null
          provider_id: string | null
          recipient: string | null
          sent_at: string | null
          snapshot: Json
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivery_status?: string | null
          delivery_updated_at?: string | null
          first_attempt_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          lock_token?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          order_id: string
          payload?: Json | null
          provider_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          snapshot: Json
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivery_status?: string | null
          delivery_updated_at?: string | null
          first_attempt_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          lock_token?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          order_id?: string
          payload?: Json | null
          provider_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          snapshot?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_emails_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          order_id: string
          product_id: string | null
          product_image_path: string
          product_name: string
          quantity: number
          regular_unit_price: number | null
          size: string
          unit_price: number
          was_on_sale: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          order_id: string
          product_id?: string | null
          product_image_path?: string
          product_name: string
          quantity: number
          regular_unit_price?: number | null
          size: string
          unit_price: number
          was_on_sale?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string | null
          product_image_path?: string
          product_name?: string
          quantity?: number
          regular_unit_price?: number | null
          size?: string
          unit_price?: number
          was_on_sale?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_notes: string
          cancellation_reason: string
          created_at: string
          customer_email: string
          customer_first_name: string
          customer_last_name: string
          customer_notes: string
          customer_phone: string
          discount_amount: number
          discount_code: string
          id: string
          order_number: string
          paid_at: string | null
          payment_reference: string
          payment_status: string
          shipping_address_line_1: string
          shipping_address_line_2: string
          shipping_amount: number
          shipping_city: string
          shipping_country: string
          shipping_postal_code: string
          shipping_province: string
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          admin_notes?: string
          cancellation_reason?: string
          created_at?: string
          customer_email: string
          customer_first_name: string
          customer_last_name: string
          customer_notes?: string
          customer_phone: string
          discount_amount?: number
          discount_code?: string
          id?: string
          order_number: string
          paid_at?: string | null
          payment_reference?: string
          payment_status?: string
          shipping_address_line_1: string
          shipping_address_line_2?: string
          shipping_amount?: number
          shipping_city: string
          shipping_country?: string
          shipping_postal_code: string
          shipping_province: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          admin_notes?: string
          cancellation_reason?: string
          created_at?: string
          customer_email?: string
          customer_first_name?: string
          customer_last_name?: string
          customer_notes?: string
          customer_phone?: string
          discount_amount?: number
          discount_code?: string
          id?: string
          order_number?: string
          paid_at?: string | null
          payment_reference?: string
          payment_status?: string
          shipping_address_line_1?: string
          shipping_address_line_2?: string
          shipping_amount?: number
          shipping_city?: string
          shipping_country?: string
          shipping_postal_code?: string
          shipping_province?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_reminder_settings: {
        Row: {
          enabled: boolean
          enabled_from: string
          id: boolean
          worker_locked_until: string | null
          worker_token: string | null
        }
        Insert: {
          enabled?: boolean
          enabled_from?: string
          id?: boolean
          worker_locked_until?: string | null
          worker_token?: string | null
        }
        Update: {
          enabled?: boolean
          enabled_from?: string
          id?: boolean
          worker_locked_until?: string | null
          worker_token?: string | null
        }
        Relationships: []
      }
      payment_reminders: {
        Row: {
          attempts: number
          created_at: string
          delivery_status: string | null
          delivery_updated_at: string | null
          expires_at: string
          first_attempt_at: string | null
          id: string
          last_error: string | null
          lock_token: string | null
          locked_until: string | null
          next_attempt_at: string
          order_id: string
          payload: Json | null
          provider_id: string | null
          recipient: string | null
          sent_at: string | null
          snapshot: Json
          status: string
          token: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivery_status?: string | null
          delivery_updated_at?: string | null
          expires_at?: string
          first_attempt_at?: string | null
          id?: string
          last_error?: string | null
          lock_token?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          order_id: string
          payload?: Json | null
          provider_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          snapshot: Json
          status?: string
          token?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivery_status?: string | null
          delivery_updated_at?: string | null
          expires_at?: string
          first_attempt_at?: string | null
          id?: string
          last_error?: string | null
          lock_token?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          order_id?: string
          payload?: Json | null
          provider_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          snapshot?: Json
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          care: string
          category: string
          category_id: string | null
          created_at: string
          description: string
          fabric: string
          id: string
          images: string[]
          is_active: boolean
          is_bestseller: boolean
          is_featured: boolean
          name: string
          price: number
          sale_price: number | null
          sale_revision: number
          sizes: string[]
          sort_order: number
          updated_at: string
        }
        Insert: {
          care?: string
          category?: string
          category_id?: string | null
          created_at?: string
          description?: string
          fabric?: string
          id: string
          images?: string[]
          is_active?: boolean
          is_bestseller?: boolean
          is_featured?: boolean
          name: string
          price: number
          sale_price?: number | null
          sale_revision?: number
          sizes?: string[]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          care?: string
          category?: string
          category_id?: string | null
          created_at?: string
          description?: string
          fabric?: string
          id?: string
          images?: string[]
          is_active?: boolean
          is_bestseller?: boolean
          is_featured?: boolean
          name?: string
          price?: number
          sale_price?: number | null
          sale_revision?: number
          sizes?: string[]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_settings: {
        Row: {
          flat_rate: number
          free_shipping_threshold: number
          id: boolean
        }
        Insert: {
          flat_rate: number
          free_shipping_threshold: number
          id?: boolean
        }
        Update: {
          flat_rate?: number
          free_shipping_threshold?: number
          id?: boolean
        }
        Relationships: []
      }
      subscription_notifications: {
        Row: {
          attempts: number
          created_at: string
          delivery_status: string | null
          delivery_updated_at: string | null
          first_attempt_at: string | null
          id: string
          kind: string
          last_error: string | null
          lock_token: string | null
          locked_until: string | null
          next_attempt_at: string
          payload: Json | null
          provider_id: string | null
          recipient: string | null
          sent_at: string | null
          snapshot: Json
          status: string
          subscriber_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivery_status?: string | null
          delivery_updated_at?: string | null
          first_attempt_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          lock_token?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          payload?: Json | null
          provider_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          snapshot: Json
          status?: string
          subscriber_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivery_status?: string | null
          delivery_updated_at?: string | null
          first_attempt_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          lock_token?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          payload?: Json | null
          provider_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          snapshot?: Json
          status?: string
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_notifications_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "newsletter_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_worker_lock: {
        Row: {
          id: boolean
          locked_until: string | null
          token: string | null
        }
        Insert: {
          id?: boolean
          locked_until?: string | null
          token?: string | null
        }
        Update: {
          id?: boolean
          locked_until?: string | null
          token?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _coupon_discount: {
        Args: {
          p_code: string
          p_email: string
          p_lock: boolean
          p_subtotal: number
        }
        Returns: {
          code: string
          coupon_id: string
          discount: number
        }[]
      }
      acquire_marketing_worker: { Args: never; Returns: string }
      acquire_reminder_worker: { Args: never; Returns: string }
      acquire_subscription_worker: { Args: never; Returns: string }
      cancel_marketing_campaign: { Args: { p_id: string }; Returns: undefined }
      cancellation_email_allowed: {
        Args: { p_id: string; p_token: string }
        Returns: boolean
      }
      claim_cancellation_email: { Args: never; Returns: Json }
      claim_marketing_delivery: { Args: never; Returns: Json }
      claim_order_email: {
        Args: never
        Returns: {
          attempts: number
          created_at: string
          delivery_status: string | null
          delivery_updated_at: string | null
          first_attempt_at: string | null
          id: string
          kind: string
          last_error: string | null
          lock_token: string | null
          locked_until: string | null
          next_attempt_at: string
          order_id: string
          payload: Json | null
          provider_id: string | null
          recipient: string | null
          sent_at: string | null
          snapshot: Json
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "order_emails"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_payment_reminder: { Args: never; Returns: Json }
      claim_subscription_notification: { Args: never; Returns: Json }
      configure_payment_reminders: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      dispatch_marketing_emails: { Args: never; Returns: undefined }
      dispatch_order_emails: { Args: never; Returns: undefined }
      dispatch_order_expiry: { Args: never; Returns: undefined }
      dispatch_payment_reminders: { Args: never; Returns: undefined }
      dispatch_subscription_notifications: { Args: never; Returns: undefined }
      expand_marketing_campaigns: { Args: never; Returns: undefined }
      expire_unpaid_orders: { Args: { p_order_id?: string }; Returns: number }
      finish_marketing_campaigns: { Args: never; Returns: undefined }
      finish_marketing_delivery: {
        Args: { p_id: string; p_provider_id: string; p_token: string }
        Returns: undefined
      }
      finish_order_email: {
        Args: { p_id: string; p_lock_token: string; p_provider_id: string }
        Returns: boolean
      }
      finish_payment_reminder: {
        Args: { p_id: string; p_provider_id: string; p_token: string }
        Returns: undefined
      }
      finish_subscription_notification: {
        Args: { p_id: string; p_provider_id: string; p_token: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      marketing_content: { Args: { p_id: string }; Returns: Json }
      marketing_coupon_content: { Args: { p_id: string }; Returns: Json }
      marketing_delivery_allowed: {
        Args: { p_id: string; p_token: string }
        Returns: boolean
      }
      newsletter_admin_summary: { Args: never; Returns: Json }
      newsletter_join: {
        Args: { p_email: string; p_ip_hash: string }
        Returns: string
      }
      newsletter_unsubscribe: { Args: { p_token: string }; Returns: undefined }
      order_payment_recovery: {
        Args: { p_action: string; p_token: string }
        Returns: Json
      }
      payment_reminder_allowed: {
        Args: { p_id: string; p_token: string }
        Returns: boolean
      }
      place_order: {
        Args: { p_coupon_code?: string; p_customer: Json; p_items: Json }
        Returns: Json
      }
      queue_coupon_announcement: {
        Args: { p_coupon_id: string }
        Returns: string
      }
      queue_payment_reminders: { Args: never; Returns: undefined }
      record_order_email_event: {
        Args: {
          p_event_id: string
          p_occurred_at: string
          p_provider_id: string
          p_status: string
        }
        Returns: undefined
      }
      release_marketing_worker: {
        Args: { p_token: string }
        Returns: undefined
      }
      release_reminder_worker: { Args: { p_token: string }; Returns: undefined }
      release_subscription_worker: {
        Args: { p_token: string }
        Returns: undefined
      }
      subscription_notification_allowed: {
        Args: { p_id: string; p_token: string }
        Returns: boolean
      }
      sync_order_email_delivery: {
        Args: { p_provider_id: string }
        Returns: undefined
      }
      validate_coupon: {
        Args: { p_code: string; p_email: string; p_items: Json }
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
    Enums: {},
  },
} as const
