-- 1. Таблиця пусків (launches)
CREATE TABLE IF NOT EXISTS public.launches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    battle_group_id TEXT NOT NULL,
    allocation_line_id TEXT,
    asset_id TEXT NOT NULL,
    asset_serial_number TEXT NOT NULL,
    tracker_model_id TEXT,
    tracker_model_serial_number TEXT,
    aiming_point_mgrs TEXT NOT NULL,
    trajectory_name TEXT,
    ammo_model_id TEXT NOT NULL,
    ammo_quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    reported_at TIMESTAMPTZ,
    reported_at_time TIME,
    processed_at TIMESTAMPTZ,
    launch_status_id TEXT NOT NULL DEFAULT 'PLANNED',
    cause_launch_problem_id TEXT,
    comments TEXT DEFAULT '',
    actual_launch_time TEXT,
    execution_status TEXT,
    bda_result TEXT,
    audio_url TEXT
);

-- 2. Таблиця контрольних точок (checkpoint_reports)
CREATE TABLE IF NOT EXISTS public.checkpoint_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    battle_group_id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    fixed_time TEXT NOT NULL,
    description TEXT,
    audio_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Індекси
CREATE INDEX IF NOT EXISTS idx_launches_battle_group ON public.launches(battle_group_id);
CREATE INDEX IF NOT EXISTS idx_launches_task_id ON public.launches(task_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_battle_group ON public.checkpoint_reports(battle_group_id);

-- 4. Тригер автооновлення updated_at
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_launches_updated_at ON public.launches;
CREATE TRIGGER trigger_launches_updated_at
BEFORE UPDATE ON public.launches
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- 5. Сховище для аудіо
INSERT INTO storage.buckets (id, name, public)
VALUES ('tactical-voice', 'tactical-voice', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Tactical Voice Access"
ON storage.objects FOR ALL
USING (bucket_id = 'tactical-voice')
WITH CHECK (bucket_id = 'tactical-voice');

-- 6. Тестові дані для екіпажу 1.1.1
DO $$
DECLARE
    v_task_id UUID := 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
    v_crew_id TEXT := 'crew_1.1.1';
    v_target_mgrs TEXT := '36U EV 45210 88320';
BEGIN
    DELETE FROM public.launches WHERE battle_group_id = v_crew_id;

    INSERT INTO public.launches (
        task_id, battle_group_id, asset_id, asset_serial_number,
        tracker_model_id, tracker_model_serial_number,
        aiming_point_mgrs, trajectory_name, ammo_model_id,
        ammo_quantity, launch_status_id
    ) VALUES
    (v_task_id, v_crew_id, 'asset_voron_01', '104', 'trk_model_std', 'TRK-8821', v_target_mgrs, '№1', 'ammo_std_01', 1, 'PLANNED'),
    (v_task_id, v_crew_id, 'asset_voron_01', '105', 'trk_model_std', 'TRK-8825', v_target_mgrs, '№2', 'ammo_std_01', 1, 'PLANNED'),
    (v_task_id, v_crew_id, 'asset_voron_01', '106', NULL, NULL, v_target_mgrs, '№2', 'ammo_std_01', 1, 'PLANNED'),
    (v_task_id, v_crew_id, 'asset_voron_01', '112', 'trk_model_std', 'TRK-9004', v_target_mgrs, '№3', 'ammo_std_01', 1, 'PLANNED');
END $$;
