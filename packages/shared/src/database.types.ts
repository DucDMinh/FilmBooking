
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "affected_order_actions": {
                  Row: {
                    "action": Database["public"]['Enums']["affected_action"],"cinema_id": string,"created_at": string,"id": string,"note": string | null,"order_id": string,"performed_by": string | null,"refund_reference": string | null,"refunded_amount": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["affected_action"],"cinema_id": string,"created_at"?: string,"id"?: string,"note"?: string | null,"order_id": string,"performed_by"?: string | null,"refund_reference"?: string | null,"refunded_amount"?: number | null
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["affected_action"],"cinema_id"?: string,"created_at"?: string,"id"?: string,"note"?: string | null,"order_id"?: string,"performed_by"?: string | null,"refund_reference"?: string | null,"refunded_amount"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "affected_order_actions_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "affected_order_actions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"affected_order_cases": {
                  Row: {
                    "cinema_id": string,"counter_contact": boolean,"created_at": string,"email_sent": boolean,"id": string,"order_id": string,"reason": string,"showtime_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cinema_id": string,"counter_contact"?: boolean,"created_at"?: string,"email_sent"?: boolean,"id"?: string,"order_id": string,"reason": string,"showtime_id": string
                  }
                  Update: {
                    "cinema_id"?: string,"counter_contact"?: boolean,"created_at"?: string,"email_sent"?: boolean,"id"?: string,"order_id"?: string,"reason"?: string,"showtime_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "affected_order_cases_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "affected_order_cases_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "affected_order_cases_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "showtimes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "affected_order_cases_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_cancelled_showtimes"
      referencedColumns: ["showtime_id"]
    },{
      foreignKeyName: "affected_order_cases_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_showtime_sales"
      referencedColumns: ["showtime_id"]
    }
                  ]
                },"app_settings": {
                  Row: {
                    "description": string | null,"key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"after_data": Json | null,"before_data": Json | null,"cinema_id": string | null,"id": number,"occurred_at": string,"record_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after_data"?: Json | null,"before_data"?: Json | null,"cinema_id"?: string | null,"id"?: never,"occurred_at"?: string,"record_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after_data"?: Json | null,"before_data"?: Json | null,"cinema_id"?: string | null,"id"?: never,"occurred_at"?: string,"record_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"checkin_logs": {
                  Row: {
                    "id": string,"result": Database["public"]['Enums']["checkin_result"],"scanned_at": string,"scanned_by": string | null,"scanner_cinema_id": string,"showtime_id": string | null,"ticket_cinema_id": string | null,"ticket_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"result": Database["public"]['Enums']["checkin_result"],"scanned_at"?: string,"scanned_by"?: string | null,"scanner_cinema_id": string,"showtime_id"?: string | null,"ticket_cinema_id"?: string | null,"ticket_id"?: string | null
                  }
                  Update: {
                    "id"?: string,"result"?: Database["public"]['Enums']["checkin_result"],"scanned_at"?: string,"scanned_by"?: string | null,"scanner_cinema_id"?: string,"showtime_id"?: string | null,"ticket_cinema_id"?: string | null,"ticket_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "checkin_logs_scanner_cinema_id_fkey"
      columns: ["scanner_cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checkin_logs_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "showtimes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checkin_logs_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_cancelled_showtimes"
      referencedColumns: ["showtime_id"]
    },{
      foreignKeyName: "checkin_logs_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_showtime_sales"
      referencedColumns: ["showtime_id"]
    },{
      foreignKeyName: "checkin_logs_ticket_cinema_id_fkey"
      columns: ["ticket_cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checkin_logs_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"cinema_settings": {
                  Row: {
                    "cinema_id": string,"key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "cinema_id": string,"key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "cinema_id"?: string,"key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "cinema_settings_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cinema_settings_key_fkey"
      columns: ["key"]
isOneToOne: false
      referencedRelation: "app_settings"
      referencedColumns: ["key"]
    }
                  ]
                },"cinemas": {
                  Row: {
                    "address": string,"amenities": (string)[],"cleaning_minutes": number | null,"code": string,"created_at": string,"district": string | null,"email": string | null,"hotline": string | null,"id": string,"image_url": string | null,"latitude": number | null,"longitude": number | null,"name": string,"online_cutoff_minutes": number | null,"opening_hours": string | null,"province_id": string,"status": Database["public"]['Enums']["cinema_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address": string,"amenities"?: (string)[],"cleaning_minutes"?: number | null,"code": string,"created_at"?: string,"district"?: string | null,"email"?: string | null,"hotline"?: string | null,"id"?: string,"image_url"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"name": string,"online_cutoff_minutes"?: number | null,"opening_hours"?: string | null,"province_id": string,"status"?: Database["public"]['Enums']["cinema_status"],"updated_at"?: string
                  }
                  Update: {
                    "address"?: string,"amenities"?: (string)[],"cleaning_minutes"?: number | null,"code"?: string,"created_at"?: string,"district"?: string | null,"email"?: string | null,"hotline"?: string | null,"id"?: string,"image_url"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"name"?: string,"online_cutoff_minutes"?: number | null,"opening_hours"?: string | null,"province_id"?: string,"status"?: Database["public"]['Enums']["cinema_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cinemas_province_id_fkey"
      columns: ["province_id"]
isOneToOne: false
      referencedRelation: "provinces"
      referencedColumns: ["id"]
    }
                  ]
                },"consents": {
                  Row: {
                    "accepted_at": string,"consent_type": Database["public"]['Enums']["consent_type"],"id": string,"metadata": NonNullable<Json>,"user_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"consent_type": Database["public"]['Enums']["consent_type"],"id"?: string,"metadata"?: NonNullable<Json>,"user_id": string,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"consent_type"?: Database["public"]['Enums']["consent_type"],"id"?: string,"metadata"?: NonNullable<Json>,"user_id"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"disposable_email_domains": {
                  Row: {
                    "created_at": string,"domain": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"domain": string
                  }
                  Update: {
                    "created_at"?: string,"domain"?: string
                  }
                  Relationships: [
                    
                  ]
                },"email_outbox": {
                  Row: {
                    "attempts": number,"cinema_id": string | null,"created_at": string,"id": string,"kind": string,"last_error": string | null,"next_attempt_at": string,"payload": NonNullable<Json>,"sent_at": string | null,"status": Database["public"]['Enums']["outbox_status"],"to_email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"cinema_id"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"last_error"?: string | null,"next_attempt_at"?: string,"payload"?: NonNullable<Json>,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"to_email": string
                  }
                  Update: {
                    "attempts"?: number,"cinema_id"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"payload"?: NonNullable<Json>,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"to_email"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_outbox_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    }
                  ]
                },"favorite_cinemas": {
                  Row: {
                    "cinema_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cinema_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "cinema_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorite_cinemas_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    }
                  ]
                },"holidays": {
                  Row: {
                    "created_at": string,"holiday_date": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"holiday_date": string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"holiday_date"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"login_attempts": {
                  Row: {
                    "email": string,"failed_count": number,"last_failed_at": string | null,"locked_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "email": string,"failed_count"?: number,"last_failed_at"?: string | null,"locked_until"?: string | null
                  }
                  Update: {
                    "email"?: string,"failed_count"?: number,"last_failed_at"?: string | null,"locked_until"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"movies": {
                  Row: {
                    "age_rating": Database["public"]['Enums']["movie_age_rating"],"banner_url": string | null,"cast_members": (string)[],"country": string | null,"created_at": string,"description": string | null,"director": string | null,"dubbed_languages": (string)[],"duration_minutes": number,"genres": (string)[],"id": string,"original_language": string | null,"poster_url": string | null,"release_date": string,"slug": string,"status": Database["public"]['Enums']["movie_status"],"subtitle_languages": (string)[],"title_original": string | null,"title_vi": string,"trailer_url": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "age_rating": Database["public"]['Enums']["movie_age_rating"],"banner_url"?: string | null,"cast_members"?: (string)[],"country"?: string | null,"created_at"?: string,"description"?: string | null,"director"?: string | null,"dubbed_languages"?: (string)[],"duration_minutes": number,"genres"?: (string)[],"id"?: string,"original_language"?: string | null,"poster_url"?: string | null,"release_date": string,"slug": string,"status"?: Database["public"]['Enums']["movie_status"],"subtitle_languages"?: (string)[],"title_original"?: string | null,"title_vi": string,"trailer_url"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "age_rating"?: Database["public"]['Enums']["movie_age_rating"],"banner_url"?: string | null,"cast_members"?: (string)[],"country"?: string | null,"created_at"?: string,"description"?: string | null,"director"?: string | null,"dubbed_languages"?: (string)[],"duration_minutes"?: number,"genres"?: (string)[],"id"?: string,"original_language"?: string | null,"poster_url"?: string | null,"release_date"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["movie_status"],"subtitle_languages"?: (string)[],"title_original"?: string | null,"title_vi"?: string,"trailer_url"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"oauth_missing_email_requests": {
                  Row: {
                    "consumed_at": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"oauth_state_token": string | null,"provider": string,"provider_access_token": string | null,"verification_token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consumed_at"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"oauth_state_token"?: string | null,"provider"?: string,"provider_access_token"?: string | null,"verification_token": string
                  }
                  Update: {
                    "consumed_at"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"oauth_state_token"?: string | null,"provider"?: string,"provider_access_token"?: string | null,"verification_token"?: string
                  }
                  Relationships: [
                    
                  ]
                },"order_seats": {
                  Row: {
                    "created_at": string,"id": string,"order_id": string,"price_amount": number,"seat_id": string,"seat_label": string,"seat_type": Database["public"]['Enums']["seat_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"order_id": string,"price_amount": number,"seat_id": string,"seat_label": string,"seat_type": Database["public"]['Enums']["seat_type"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"order_id"?: string,"price_amount"?: number,"seat_id"?: string,"seat_label"?: string,"seat_type"?: Database["public"]['Enums']["seat_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_seats_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_seats_seat_id_fkey"
      columns: ["seat_id"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "age_confirmed": boolean,"booking_code": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"channel": Database["public"]['Enums']["order_channel"],"cinema_code": string,"cinema_id": string,"cinema_name": string,"consent_at": string | null,"contact_email": string | null,"contact_phone": string | null,"counter_contact": boolean,"created_at": string,"discount_amount": number,"hold_expires_at": string | null,"id": string,"manual_review_resolved_at": string | null,"movie_title": string,"room_name": string,"showtime_ends_at": string,"showtime_id": string,"showtime_starts_at": string,"status": Database["public"]['Enums']["order_status"],"subtotal_amount": number,"total_amount": number,"updated_at": string,"user_id": string | null,"voucher_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "age_confirmed"?: boolean,"booking_code"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"channel": Database["public"]['Enums']["order_channel"],"cinema_code": string,"cinema_id": string,"cinema_name": string,"consent_at"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"counter_contact"?: boolean,"created_at"?: string,"discount_amount"?: number,"hold_expires_at"?: string | null,"id"?: string,"manual_review_resolved_at"?: string | null,"movie_title": string,"room_name": string,"showtime_ends_at": string,"showtime_id": string,"showtime_starts_at": string,"status"?: Database["public"]['Enums']["order_status"],"subtotal_amount"?: number,"total_amount"?: number,"updated_at"?: string,"user_id"?: string | null,"voucher_id"?: string | null
                  }
                  Update: {
                    "age_confirmed"?: boolean,"booking_code"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"channel"?: Database["public"]['Enums']["order_channel"],"cinema_code"?: string,"cinema_id"?: string,"cinema_name"?: string,"consent_at"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"counter_contact"?: boolean,"created_at"?: string,"discount_amount"?: number,"hold_expires_at"?: string | null,"id"?: string,"manual_review_resolved_at"?: string | null,"movie_title"?: string,"room_name"?: string,"showtime_ends_at"?: string,"showtime_id"?: string,"showtime_starts_at"?: string,"status"?: Database["public"]['Enums']["order_status"],"subtotal_amount"?: number,"total_amount"?: number,"updated_at"?: string,"user_id"?: string | null,"voucher_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "showtimes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_cancelled_showtimes"
      referencedColumns: ["showtime_id"]
    },{
      foreignKeyName: "orders_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_showtime_sales"
      referencedColumns: ["showtime_id"]
    },{
      foreignKeyName: "orders_voucher_id_fkey"
      columns: ["voucher_id"]
isOneToOne: false
      referencedRelation: "vouchers"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_events": {
                  Row: {
                    "amount": number | null,"cinema_id": string | null,"event_status": string,"id": string,"occurred_at": string | null,"order_code": number | null,"payment_id": string | null,"received_at": string,"signature_valid": boolean,"transaction_ref": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"cinema_id"?: string | null,"event_status": string,"id"?: string,"occurred_at"?: string | null,"order_code"?: number | null,"payment_id"?: string | null,"received_at"?: string,"signature_valid": boolean,"transaction_ref"?: string | null
                  }
                  Update: {
                    "amount"?: number | null,"cinema_id"?: string | null,"event_status"?: string,"id"?: string,"occurred_at"?: string | null,"order_code"?: number | null,"payment_id"?: string | null,"received_at"?: string,"signature_valid"?: boolean,"transaction_ref"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_events_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_events_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_events_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "v_report_payos_reconciliation"
      referencedColumns: ["payment_id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"cinema_id": string,"created_at": string,"id": string,"order_code": number,"order_id": string,"paid_at": string | null,"payment_link_id": string | null,"status": Database["public"]['Enums']["payment_status"],"transaction_ref": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"cinema_id": string,"created_at"?: string,"id"?: string,"order_code": number,"order_id": string,"paid_at"?: string | null,"payment_link_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"transaction_ref"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"cinema_id"?: string,"created_at"?: string,"id"?: string,"order_code"?: number,"order_id"?: string,"paid_at"?: string | null,"payment_link_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"transaction_ref"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"pos_api_keys": {
                  Row: {
                    "cinema_id": string,"created_at": string,"id": string,"key_hash": string,"prefix": string,"revoked_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cinema_id": string,"created_at"?: string,"id"?: string,"key_hash": string,"prefix": string,"revoked_at"?: string | null
                  }
                  Update: {
                    "cinema_id"?: string,"created_at"?: string,"id"?: string,"key_hash"?: string,"prefix"?: string,"revoked_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pos_api_keys_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    }
                  ]
                },"pos_api_logs": {
                  Row: {
                    "cinema_id": string | null,"id": number,"key_id": string | null,"method": string,"occurred_at": string,"path": string,"request_id": string | null,"status_code": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cinema_id"?: string | null,"id"?: never,"key_id"?: string | null,"method": string,"occurred_at"?: string,"path": string,"request_id"?: string | null,"status_code"?: number | null
                  }
                  Update: {
                    "cinema_id"?: string | null,"id"?: never,"key_id"?: string | null,"method"?: string,"occurred_at"?: string,"path"?: string,"request_id"?: string | null,"status_code"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pos_api_logs_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pos_api_logs_key_id_fkey"
      columns: ["key_id"]
isOneToOne: false
      referencedRelation: "pos_api_keys"
      referencedColumns: ["id"]
    }
                  ]
                },"pos_requests": {
                  Row: {
                    "created_at": string,"order_id": string,"request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"order_id": string,"request_id": string
                  }
                  Update: {
                    "created_at"?: string,"order_id"?: string,"request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pos_requests_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"price_rules": {
                  Row: {
                    "amount": number,"cinema_id": string | null,"created_at": string,"day_type": Database["public"]['Enums']["price_day_type"] | null,"format": Database["public"]['Enums']["screen_format"] | null,"id": string,"scope": Database["public"]['Enums']["price_scope"],"seat_type": Database["public"]['Enums']["seat_type"],"showtime_id": string | null,"time_band": Database["public"]['Enums']["price_time_band"] | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"cinema_id"?: string | null,"created_at"?: string,"day_type"?: Database["public"]['Enums']["price_day_type"] | null,"format"?: Database["public"]['Enums']["screen_format"] | null,"id"?: string,"scope": Database["public"]['Enums']["price_scope"],"seat_type": Database["public"]['Enums']["seat_type"],"showtime_id"?: string | null,"time_band"?: Database["public"]['Enums']["price_time_band"] | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"cinema_id"?: string | null,"created_at"?: string,"day_type"?: Database["public"]['Enums']["price_day_type"] | null,"format"?: Database["public"]['Enums']["screen_format"] | null,"id"?: string,"scope"?: Database["public"]['Enums']["price_scope"],"seat_type"?: Database["public"]['Enums']["seat_type"],"showtime_id"?: string | null,"time_band"?: Database["public"]['Enums']["price_time_band"] | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_rules_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_rules_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "showtimes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_rules_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_cancelled_showtimes"
      referencedColumns: ["showtime_id"]
    },{
      foreignKeyName: "price_rules_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_showtime_sales"
      referencedColumns: ["showtime_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"date_of_birth": string | null,"email": string | null,"full_name": string | null,"gender": Database["public"]['Enums']["gender"] | null,"id": string,"marketing_opt_in": boolean,"phone": string | null,"province_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"email"?: string | null,"full_name"?: string | null,"gender"?: Database["public"]['Enums']["gender"] | null,"id": string,"marketing_opt_in"?: boolean,"phone"?: string | null,"province_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"email"?: string | null,"full_name"?: string | null,"gender"?: Database["public"]['Enums']["gender"] | null,"id"?: string,"marketing_opt_in"?: boolean,"phone"?: string | null,"province_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_province_id_fkey"
      columns: ["province_id"]
isOneToOne: false
      referencedRelation: "provinces"
      referencedColumns: ["id"]
    }
                  ]
                },"provinces": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"rate_limit_buckets": {
                  Row: {
                    "hits": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hits"?: number,"key": string,"window_start"?: string
                  }
                  Update: {
                    "hits"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rooms": {
                  Row: {
                    "cinema_id": string,"created_at": string,"grid_cols": number,"grid_rows": number,"id": string,"name": string,"status": Database["public"]['Enums']["room_status"],"supported_formats": (Database["public"]['Enums']["screen_format"])[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cinema_id": string,"created_at"?: string,"grid_cols"?: number,"grid_rows"?: number,"id"?: string,"name": string,"status"?: Database["public"]['Enums']["room_status"],"supported_formats"?: (Database["public"]['Enums']["screen_format"])[],"updated_at"?: string
                  }
                  Update: {
                    "cinema_id"?: string,"created_at"?: string,"grid_cols"?: number,"grid_rows"?: number,"id"?: string,"name"?: string,"status"?: Database["public"]['Enums']["room_status"],"supported_formats"?: (Database["public"]['Enums']["screen_format"])[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rooms_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    }
                  ]
                },"seat_status_public": {
                  Row: {
                    "expires_at": string | null,"seat_id": string,"showtime_id": string,"state": Database["public"]['Enums']["seat_state"]
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at"?: string | null,"seat_id": string,"showtime_id": string,"state": Database["public"]['Enums']["seat_state"]
                  }
                  Update: {
                    "expires_at"?: string | null,"seat_id"?: string,"showtime_id"?: string,"state"?: Database["public"]['Enums']["seat_state"]
                  }
                  Relationships: [
                    
                  ]
                },"seats": {
                  Row: {
                    "cinema_id": string,"col_number": number,"col_span": number | null,"created_at": string,"id": string,"label": string | null,"room_id": string,"row_label": string,"seat_type": Database["public"]['Enums']["seat_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "cinema_id": string,"col_number": number,"col_span"?: never,"created_at"?: string,"id"?: string,"label"?: string | null,"room_id": string,"row_label": string,"seat_type"?: Database["public"]['Enums']["seat_type"]
                  }
                  Update: {
                    "cinema_id"?: string,"col_number"?: number,"col_span"?: never,"created_at"?: string,"id"?: string,"label"?: string | null,"room_id"?: string,"row_label"?: string,"seat_type"?: Database["public"]['Enums']["seat_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "seats_room_id_cinema_id_fkey"
      columns: ["room_id","cinema_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","cinema_id"]
    }
                  ]
                },"showtime_seat_locks": {
                  Row: {
                    "cinema_id": string,"created_at": string,"id": string,"locked_by": string | null,"reason": Database["public"]['Enums']["lock_reason"],"room_id": string,"seat_id": string,"showtime_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cinema_id": string,"created_at"?: string,"id"?: string,"locked_by"?: string | null,"reason"?: Database["public"]['Enums']["lock_reason"],"room_id": string,"seat_id": string,"showtime_id": string
                  }
                  Update: {
                    "cinema_id"?: string,"created_at"?: string,"id"?: string,"locked_by"?: string | null,"reason"?: Database["public"]['Enums']["lock_reason"],"room_id"?: string,"seat_id"?: string,"showtime_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "showtime_seat_locks_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "showtime_seat_locks_seat_id_room_id_fkey"
      columns: ["seat_id","room_id"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id","room_id"]
    },{
      foreignKeyName: "showtime_seat_locks_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "showtimes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "showtime_seat_locks_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_cancelled_showtimes"
      referencedColumns: ["showtime_id"]
    },{
      foreignKeyName: "showtime_seat_locks_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_showtime_sales"
      referencedColumns: ["showtime_id"]
    }
                  ]
                },"showtime_seat_states": {
                  Row: {
                    "cinema_id": string,"created_at": string,"expires_at": string | null,"id": string,"order_id": string,"room_id": string,"seat_id": string,"showtime_id": string,"source": Database["public"]['Enums']["order_channel"],"state": Database["public"]['Enums']["seat_state"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cinema_id": string,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"order_id": string,"room_id": string,"seat_id": string,"showtime_id": string,"source": Database["public"]['Enums']["order_channel"],"state": Database["public"]['Enums']["seat_state"],"updated_at"?: string
                  }
                  Update: {
                    "cinema_id"?: string,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"order_id"?: string,"room_id"?: string,"seat_id"?: string,"showtime_id"?: string,"source"?: Database["public"]['Enums']["order_channel"],"state"?: Database["public"]['Enums']["seat_state"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "showtime_seat_states_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "showtime_seat_states_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "showtime_seat_states_seat_id_room_id_fkey"
      columns: ["seat_id","room_id"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id","room_id"]
    },{
      foreignKeyName: "showtime_seat_states_showtime_id_room_id_fkey"
      columns: ["showtime_id","room_id"]
isOneToOne: false
      referencedRelation: "showtimes"
      referencedColumns: ["id","room_id"]
    },{
      foreignKeyName: "showtime_seat_states_showtime_id_room_id_fkey"
      columns: ["showtime_id","room_id"]
isOneToOne: false
      referencedRelation: "v_report_showtime_sales"
      referencedColumns: ["showtime_id","room_id"]
    }
                  ]
                },"showtimes": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"cinema_id": string,"created_at": string,"ends_at": string,"format": Database["public"]['Enums']["screen_format"],"id": string,"language_mode": Database["public"]['Enums']["language_mode"],"movie_id": string,"room_id": string,"starts_at": string,"status": Database["public"]['Enums']["showtime_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"cinema_id": string,"created_at"?: string,"ends_at": string,"format": Database["public"]['Enums']["screen_format"],"id"?: string,"language_mode"?: Database["public"]['Enums']["language_mode"],"movie_id": string,"room_id": string,"starts_at": string,"status"?: Database["public"]['Enums']["showtime_status"],"updated_at"?: string
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"cinema_id"?: string,"created_at"?: string,"ends_at"?: string,"format"?: Database["public"]['Enums']["screen_format"],"id"?: string,"language_mode"?: Database["public"]['Enums']["language_mode"],"movie_id"?: string,"room_id"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["showtime_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "showtimes_movie_id_fkey"
      columns: ["movie_id"]
isOneToOne: false
      referencedRelation: "movies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "showtimes_room_id_cinema_id_fkey"
      columns: ["room_id","cinema_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","cinema_id"]
    }
                  ]
                },"staff_assignments": {
                  Row: {
                    "assigned_by": string | null,"cinema_id": string,"created_at": string,"id": string,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_by"?: string | null,"cinema_id": string,"created_at"?: string,"id"?: string,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  Update: {
                    "assigned_by"?: string | null,"cinema_id"?: string,"created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["staff_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_assignments_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    }
                  ]
                },"tickets": {
                  Row: {
                    "checked_in_at": string | null,"checked_in_by": string | null,"cinema_id": string,"created_at": string,"id": string,"order_id": string,"order_seat_id": string,"qr_token": string,"seat_id": string,"showtime_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_in_at"?: string | null,"checked_in_by"?: string | null,"cinema_id": string,"created_at"?: string,"id"?: string,"order_id": string,"order_seat_id": string,"qr_token"?: string,"seat_id": string,"showtime_id": string
                  }
                  Update: {
                    "checked_in_at"?: string | null,"checked_in_by"?: string | null,"cinema_id"?: string,"created_at"?: string,"id"?: string,"order_id"?: string,"order_seat_id"?: string,"qr_token"?: string,"seat_id"?: string,"showtime_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tickets_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_order_seat_id_fkey"
      columns: ["order_seat_id"]
isOneToOne: true
      referencedRelation: "order_seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "showtimes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_cancelled_showtimes"
      referencedColumns: ["showtime_id"]
    },{
      foreignKeyName: "tickets_showtime_id_fkey"
      columns: ["showtime_id"]
isOneToOne: false
      referencedRelation: "v_report_showtime_sales"
      referencedColumns: ["showtime_id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "created_at": string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"voucher_redemptions": {
                  Row: {
                    "created_at": string,"discount_amount": number,"id": string,"order_id": string,"status": Database["public"]['Enums']["redemption_status"],"updated_at": string,"user_id": string | null,"voucher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"discount_amount": number,"id"?: string,"order_id": string,"status"?: Database["public"]['Enums']["redemption_status"],"updated_at"?: string,"user_id"?: string | null,"voucher_id": string
                  }
                  Update: {
                    "created_at"?: string,"discount_amount"?: number,"id"?: string,"order_id"?: string,"status"?: Database["public"]['Enums']["redemption_status"],"updated_at"?: string,"user_id"?: string | null,"voucher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "voucher_redemptions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "voucher_redemptions_voucher_id_fkey"
      columns: ["voucher_id"]
isOneToOne: false
      referencedRelation: "vouchers"
      referencedColumns: ["id"]
    }
                  ]
                },"vouchers": {
                  Row: {
                    "active": boolean,"applies_to": Database["public"]['Enums']["voucher_scope"],"code": string,"created_at": string,"discount_type": Database["public"]['Enums']["voucher_discount_type"],"discount_value": number,"id": string,"max_discount": number | null,"min_order_amount": number,"movie_id": string | null,"per_user_limit": number | null,"total_uses_limit": number | null,"updated_at": string,"valid_from": string | null,"valid_to": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"applies_to"?: Database["public"]['Enums']["voucher_scope"],"code": string,"created_at"?: string,"discount_type": Database["public"]['Enums']["voucher_discount_type"],"discount_value": number,"id"?: string,"max_discount"?: number | null,"min_order_amount"?: number,"movie_id"?: string | null,"per_user_limit"?: number | null,"total_uses_limit"?: number | null,"updated_at"?: string,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"applies_to"?: Database["public"]['Enums']["voucher_scope"],"code"?: string,"created_at"?: string,"discount_type"?: Database["public"]['Enums']["voucher_discount_type"],"discount_value"?: number,"id"?: string,"max_discount"?: number | null,"min_order_amount"?: number,"movie_id"?: string | null,"per_user_limit"?: number | null,"total_uses_limit"?: number | null,"updated_at"?: string,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vouchers_movie_id_fkey"
      columns: ["movie_id"]
isOneToOne: false
      referencedRelation: "movies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_report_cancelled_showtimes": {
                  Row: {
                    "cinema_code": string,"cinema_id": string,"cinema_name": string,"ends_at": string,"exchanged_orders": number | null,"movie_title": string,"pending_orders": number | null,"refunded_manual_orders": number | null,"room_name": string,"showtime_id": string,"showtime_status": Database["public"]['Enums']["showtime_status"],"starts_at": string,"total_affected_orders": number | null,"total_refunded_amount": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_report_payos_reconciliation": {
                  Row: {
                    "cinema_code": string,"cinema_id": string,"cinema_name": string,"discrepancy_type": string | null,"order_code": number,"order_created_at": string,"order_id": string,"order_status": Database["public"]['Enums']["order_status"],"order_total_amount": number,"payment_amount": number,"payment_created_at": string,"payment_id": string,"payment_status": Database["public"]['Enums']["payment_status"],"transaction_ref": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "payments_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"v_report_revenue_daily": {
                  Row: {
                    "channel": Database["public"]['Enums']["order_channel"],"cinema_code": string,"cinema_id": string,"cinema_name": string,"gross_revenue": number | null,"net_revenue": number | null,"report_date": string | null,"total_discount": number | null,"total_orders": number | null,"total_tickets": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "orders_cinema_id_fkey"
      columns: ["cinema_id"]
isOneToOne: false
      referencedRelation: "cinemas"
      referencedColumns: ["id"]
    }
                  ]
                },"v_report_showtime_sales": {
                  Row: {
                    "cinema_code": string,"cinema_id": string,"cinema_name": string,"ends_at": string,"format": Database["public"]['Enums']["screen_format"],"movie_id": string,"movie_title": string,"net_revenue": number | null,"occupancy_rate": number | null,"room_capacity": number | null,"room_id": string,"room_name": string,"showtime_id": string,"showtime_status": Database["public"]['Enums']["showtime_status"],"sold_seats": number | null,"starts_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "showtimes_movie_id_fkey"
      columns: ["movie_id"]
isOneToOne: false
      referencedRelation: "movies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "showtimes_room_id_cinema_id_fkey"
      columns: ["room_id","cinema_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","cinema_id"]
    }
                  ]
                }
          }
          Functions: {
            "apply_voucher":
{ Args: { "p_code": string,"p_order_id": string }; Returns: Json
                           },
"apply_voucher_core":
{ Args: { "p_code": string,"p_order_id": string }; Returns: Json
                           },
"assert_identity_rpc_caller":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"can_view_order":
{ Args: { "p_order_id": string }; Returns: boolean
                           },
"cancel_showtimes":
{ Args: { "p_actor_id"?: string,"p_reason": string,"p_showtime_ids": (string)[] }; Returns: Json
                           },
"check_oauth_collision":
{ Args: { "p_authenticated_user_id"?: string,"p_email": string,"p_provider": string,"p_provider_id": string }; Returns: Json
                           },
"checkin_ticket":
{ Args: { "p_cinema_id": string,"p_staff_id"?: string,"p_token_or_code": string }; Returns: Json
                           },
"clear_login_failures":
{ Args: { "p_email": string }; Returns: undefined
                           },
"confirm_paid":
{ Args: { "p_amount": number,"p_order_code"?: number,"p_order_id": string,"p_transaction_ref": string }; Returns: Json
                           },
"confirm_pos_sale":
{ Args: { "p_order_id": string,"p_request_id"?: string }; Returns: Json
                           },
"confirm_zero_amount":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"delete_unconfirmed_users":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"expire_overdue_holds":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"extend_pos_hold":
{ Args: { "p_extra_minutes"?: number,"p_order_id": string }; Returns: string
                           },
"generate_booking_code":
{ Args: { "p_cinema_code": string }; Returns: string
                           },
"get_user_identities":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"has_cinema_role":
{ Args: { "p_cinema_id": string,"p_roles": (Database["public"]['Enums']["staff_role"])[] }; Returns: boolean
                           },
"has_cinema_scope":
{ Args: { "p_cinema_id": string }; Returns: boolean
                           },
"hit_rate_limit":
{ Args: { "p_key": string,"p_max": number,"p_window": string }; Returns: boolean
                           },
"hold_seats":
{ Args: { "p_channel"?: string,"p_request_id"?: string,"p_seat_ids": (string)[],"p_showtime_id": string,"p_user_id"?: string }; Returns: {
              "booking_code": string,"discount_amount": number,"hold_expires_at": string,"order_id": string,"seat_count": number,"subtotal_amount": number,"total_amount": number
            }[]
                           },
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_disposable_email":
{ Args: { "p_email": string }; Returns: boolean
                           },
"is_login_locked":
{ Args: { "p_email": string }; Returns: boolean
                           },
"link_user_identity":
{ Args: { "p_identity_data"?: Json,"p_provider": string,"p_provider_id": string,"p_user_id": string }; Returns: Json
                           },
"mark_password_set":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"mark_payment_cancelled":
{ Args: { "p_order_id": string,"p_reason"?: string }; Returns: Json
                           },
"preview_cancel_showtimes":
{ Args: { "p_showtime_ids": (string)[] }; Returns: Json
                           },
"price_quote":
{ Args: { "p_seat_ids": (string)[],"p_showtime_id": string }; Returns: {
              "amount": number,"seat_count": number,"seat_id": string,"seat_type": Database["public"]['Enums']["seat_type"]
            }[]
                           },
"purge_expired_ops_data":
{ Args: Record<PropertyKey, never>; Returns: {
              "login_attempts": number,"pos_api_logs": number,"rate_limit_buckets": number
            }[]
                           },
"recompute_future_showtime_ends":
{ Args: { "p_cinema_id": string,"p_movie_id": string }; Returns: undefined
                           },
"record_payment_event":
{ Args: { "p_amount": number,"p_cinema_id"?: string,"p_event_status": string,"p_occurred_at"?: string,"p_order_code": number,"p_payment_id"?: string,"p_signature_valid": boolean,"p_transaction_ref": string }; Returns: {
              "amount": number | null,
"cinema_id": string | null,
"event_status": string,
"id": string,
"occurred_at": string | null,
"order_code": number | null,
"payment_id": string | null,
"received_at": string,
"signature_valid": boolean,
"transaction_ref": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payment_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"register_login_failure":
{ Args: { "p_email": string }; Returns: {
              "failed_count": number,"is_locked": boolean,"locked_until": string
            }[]
                           },
"release_seats":
{ Args: { "p_actor_id"?: string,"p_order_id": string }; Returns: undefined
                           },
"remove_voucher":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"report_by_movie_showtime":
{ Args: { "p_cinema_id"?: string,"p_from_date"?: string,"p_movie_id"?: string,"p_to_date"?: string }; Returns: {
              "cinema_code": string,"cinema_id": string,"cinema_name": string,"ends_at": string,"format": Database["public"]['Enums']["screen_format"],"movie_id": string,"movie_title": string,"net_revenue": number,"occupancy_rate": number,"room_capacity": number,"room_id": string,"room_name": string,"showtime_id": string,"showtime_status": Database["public"]['Enums']["showtime_status"],"sold_seats": number,"starts_at": string
            }[]
                           },
"report_cancelled_showtimes":
{ Args: { "p_cinema_id"?: string,"p_from_date"?: string,"p_to_date"?: string }; Returns: {
              "cinema_code": string,"cinema_id": string,"cinema_name": string,"ends_at": string,"exchanged_orders": number,"movie_title": string,"pending_orders": number,"refunded_manual_orders": number,"room_name": string,"showtime_id": string,"showtime_status": Database["public"]['Enums']["showtime_status"],"starts_at": string,"total_affected_orders": number,"total_refunded_amount": number
            }[]
                           },
"report_payos_reconciliation":
{ Args: { "p_cinema_id"?: string }; Returns: {
              "cinema_code": string,"cinema_id": string,"cinema_name": string,"discrepancy_type": string,"order_code": number,"order_created_at": string,"order_id": string,"order_status": Database["public"]['Enums']["order_status"],"order_total_amount": number,"payment_amount": number,"payment_created_at": string,"payment_id": string,"payment_status": Database["public"]['Enums']["payment_status"],"transaction_ref": string
            }[]
                           },
"report_revenue":
{ Args: { "p_channel"?: Database["public"]['Enums']["order_channel"],"p_cinema_id"?: string,"p_from_date"?: string,"p_to_date"?: string }; Returns: {
              "channel": Database["public"]['Enums']["order_channel"],"cinema_code": string,"cinema_id": string,"cinema_name": string,"gross_revenue": number,"net_revenue": number,"report_date": string,"total_discount": number,"total_orders": number,"total_tickets": number
            }[]
                           },
"sell_order_seats":
{ Args: { "p_order_id": string }; Returns: boolean
                           },
"set_cinema_status":
{ Args: { "p_cinema_id": string,"p_status": Database["public"]['Enums']["cinema_status"] }; Returns: Json
                           },
"showtime_has_sales":
{ Args: { "p_showtime_id": string }; Returns: boolean
                           },
"unlink_user_identity":
{ Args: { "p_provider": string,"p_user_id": string }; Returns: Json
                           }
          }
          Enums: {
            "affected_action": "EXCHANGED"|"REFUNDED_MANUAL","app_role": "ADMIN","checkin_result": "SUCCESS"|"WRONG_CINEMA"|"OUTSIDE_WINDOW"|"ALREADY_USED"|"AFFECTED"|"INVALID","cinema_status": "COMING_SOON"|"OPEN"|"TEMP_CLOSED"|"CLOSED","consent_type": "TERMS_OF_SERVICE"|"PRIVACY_POLICY"|"NO_REFUND_BOOKING","gender": "MALE"|"FEMALE"|"OTHER","language_mode": "SUBTITLED"|"DUBBED"|"ORIGINAL","lock_reason": "GUEST"|"BROKEN_EQUIPMENT"|"OTHER","movie_age_rating": "P"|"K"|"T13"|"T16"|"T18","movie_status": "DRAFT"|"PUBLISHED"|"ARCHIVED","order_channel": "WEB"|"POS","order_status": "holding"|"pending_payment"|"paid"|"expired"|"cancelled"|"affected"|"needs_manual_review"|"refunded_manual"|"checked_in"|"exchanged","outbox_status": "PENDING"|"SENT"|"FAILED","payment_status": "PENDING"|"PAID"|"CANCELLED"|"EXPIRED"|"FAILED","price_day_type": "NORMAL"|"WEEKEND"|"HOLIDAY","price_scope": "CHAIN"|"CINEMA"|"SHOWTIME","price_time_band": "BEFORE_17"|"AFTER_17","redemption_status": "HELD"|"CONSUMED"|"RELEASED","room_status": "ACTIVE"|"MAINTENANCE","screen_format": "2D"|"3D","seat_state": "HELD"|"SOLD","seat_type": "NORMAL"|"VIP"|"SWEETBOX"|"AISLE"|"BROKEN","showtime_status": "ON_SALE"|"CLOSED"|"CANCELLED","staff_role": "STAFF"|"MANAGER","voucher_discount_type": "PERCENT"|"FIXED","voucher_scope": "TICKET"|"COMBO"|"ORDER"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "affected_action": ["EXCHANGED", "REFUNDED_MANUAL"],"app_role": ["ADMIN"],"checkin_result": ["SUCCESS", "WRONG_CINEMA", "OUTSIDE_WINDOW", "ALREADY_USED", "AFFECTED", "INVALID"],"cinema_status": ["COMING_SOON", "OPEN", "TEMP_CLOSED", "CLOSED"],"consent_type": ["TERMS_OF_SERVICE", "PRIVACY_POLICY", "NO_REFUND_BOOKING"],"gender": ["MALE", "FEMALE", "OTHER"],"language_mode": ["SUBTITLED", "DUBBED", "ORIGINAL"],"lock_reason": ["GUEST", "BROKEN_EQUIPMENT", "OTHER"],"movie_age_rating": ["P", "K", "T13", "T16", "T18"],"movie_status": ["DRAFT", "PUBLISHED", "ARCHIVED"],"order_channel": ["WEB", "POS"],"order_status": ["holding", "pending_payment", "paid", "expired", "cancelled", "affected", "needs_manual_review", "refunded_manual", "checked_in", "exchanged"],"outbox_status": ["PENDING", "SENT", "FAILED"],"payment_status": ["PENDING", "PAID", "CANCELLED", "EXPIRED", "FAILED"],"price_day_type": ["NORMAL", "WEEKEND", "HOLIDAY"],"price_scope": ["CHAIN", "CINEMA", "SHOWTIME"],"price_time_band": ["BEFORE_17", "AFTER_17"],"redemption_status": ["HELD", "CONSUMED", "RELEASED"],"room_status": ["ACTIVE", "MAINTENANCE"],"screen_format": ["2D", "3D"],"seat_state": ["HELD", "SOLD"],"seat_type": ["NORMAL", "VIP", "SWEETBOX", "AISLE", "BROKEN"],"showtime_status": ["ON_SALE", "CLOSED", "CANCELLED"],"staff_role": ["STAFF", "MANAGER"],"voucher_discount_type": ["PERCENT", "FIXED"],"voucher_scope": ["TICKET", "COMBO", "ORDER"]
          }
        }
} as const
