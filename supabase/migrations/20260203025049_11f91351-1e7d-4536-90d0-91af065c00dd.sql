-- Create personas table for OUATE children's brand
CREATE TABLE public.personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    age_range TEXT,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default OUATE personas (children age ranges)
INSERT INTO public.personas (name, age_range, description) VALUES
('Petit Explorateur', '4-6 ans', 'Enfant curieux qui découvre les routines beauté'),
('Junior Autonome', '7-9 ans', 'Enfant qui apprend à prendre soin de lui-même'),
('Pré-ado Attentif', '10-12 ans', 'Pré-adolescent soucieux de sa peau');

-- Create diagnostic_responses table
CREATE TABLE public.diagnostic_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    session_id TEXT UNIQUE NOT NULL,
    
    -- Contact info
    email TEXT,
    email_optin BOOLEAN DEFAULT false,
    phone TEXT,
    sms_optin BOOLEAN DEFAULT false,
    parent_name TEXT,
    child_name TEXT,
    child_age INTEGER,
    
    -- Persona detection
    detected_persona TEXT REFERENCES public.personas(name),
    persona_confidence REAL CHECK (persona_confidence >= 0 AND persona_confidence <= 1),
    persona_scores JSONB DEFAULT '{}',
    
    -- Diagnostic answers
    answers JSONB DEFAULT '{}',
    
    -- Tracking
    source_url TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX idx_diagnostic_responses_created_at ON public.diagnostic_responses(created_at DESC);
CREATE INDEX idx_diagnostic_responses_detected_persona ON public.diagnostic_responses(detected_persona);
CREATE INDEX idx_diagnostic_responses_email ON public.diagnostic_responses(email);
CREATE INDEX idx_diagnostic_responses_utm_source ON public.diagnostic_responses(utm_source);

-- Enable RLS
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_responses ENABLE ROW LEVEL SECURITY;

-- Personas policies: public read, admin write (for now allow all authenticated)
CREATE POLICY "Personas are publicly readable"
ON public.personas FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can manage personas"
ON public.personas FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Diagnostic responses policies: allow insert from webhook (anon), read for authenticated
CREATE POLICY "Allow webhook inserts"
ON public.diagnostic_responses FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can read responses"
ON public.diagnostic_responses FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update responses"
ON public.diagnostic_responses FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Trigger for updated_at on personas
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_personas_updated_at
BEFORE UPDATE ON public.personas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();