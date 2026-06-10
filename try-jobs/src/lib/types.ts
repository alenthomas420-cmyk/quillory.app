// Row types mirroring supabase/migrations/0001_init.sql

export type OpeningStatus = "open" | "closed" | "filled";

export type ApplicationStatus =
  | "applied"
  | "screened"
  | "booked"
  | "rejected"
  | "withdrawn";

export type ScreeningStatus =
  | "pending"
  | "calling"
  | "call_failed"
  | "sms_in_progress"
  | "complete"
  | "failed";

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "completed"
  | "cancelled";

export type PaymentStatus = "unpaid" | "paid" | "released" | "refunded";

export type FeedbackAuthor = "employer" | "seeker";

export type FeedbackOutcome = "would_hire" | "would_not_hire" | "undecided";

export interface Employer {
  id: string;
  name: string;
  email: string;
  business_name: string;
  location: string;
  created_at: string;
}

export interface Opening {
  id: string;
  employer_id: string;
  title: string;
  location: string;
  try_day_at: string;
  hourly_rate: number;
  must_have_attributes: string[];
  status: OpeningStatus;
  screening_cap: number;
  created_at: string;
}

export interface Seeker {
  id: string;
  name: string;
  phone: string;
  earliest_availability: string;
  created_at: string;
}

export interface AttributeNote {
  attribute: string;
  note: string;
}

export interface SmsAnswer {
  question: string;
  answer: string;
}

export interface Application {
  id: string;
  opening_id: string;
  seeker_id: string;
  status: ApplicationStatus;
  screening_status: ScreeningStatus;
  vapi_call_id: string | null;
  fit_score: number | null;
  summary: string | null;
  score_justification: string | null;
  transcript: string | null;
  recording_url: string | null;
  attribute_notes: AttributeNote[];
  screening_questions: string[];
  sms_question_index: number;
  sms_answers: SmsAnswer[];
  created_at: string;
}

export interface Booking {
  id: string;
  application_id: string;
  scheduled_at: string;
  try_day_rate: number;
  hours: number;
  payment_status: PaymentStatus;
  stripe_payment_id: string | null;
  status: BookingStatus;
  created_at: string;
}

export interface Feedback {
  id: string;
  booking_id: string;
  author_role: FeedbackAuthor;
  outcome: FeedbackOutcome | null;
  rating: number | null;
  notes: string;
  created_at: string;
}
