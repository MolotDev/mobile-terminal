-- ========================================================
-- 1. ДОВІДНИКИ СИСТЕМИ (MVP PLANNING)
-- ========================================================

-- Загони
CREATE TABLE IF NOT EXISTS public.detachments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Екіпажі
CREATE TABLE IF NOT EXISTS public.battle_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    organization_id TEXT NOT NULL REFERENCES public.detachments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Контрольні точки маршруту
CREATE TABLE IF NOT EXISTS public.checkpoints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================
-- 2. ТАБЛИЦІ ПЛАНУВАННЯ ТА ЗВІТНОСТІ
-- ========================================================

-- ПЛАН: Бойовий наряд на пуски
CREATE TABLE IF NOT EXISTS public.launches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    battle_group_id TEXT NOT NULL REFERENCES public.battle_groups(id) ON DELETE CASCADE,
    allocation_line_id TEXT,
    asset_id TEXT NOT NULL,
    asset_serial_number TEXT NOT NULL DEFAULT '',
    tracker_model_id TEXT DEFAULT '',
    tracker_model_serial_number TEXT DEFAULT '',
    aiming_point_mgrs TEXT DEFAULT '',
    trajectory_name TEXT,
    ammo_model_id TEXT DEFAULT '',
    ammo_quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    reported_at TIMESTAMPTZ,
    reported_at_time TIME,
    processed_at TIMESTAMPTZ,
    launch_status_id TEXT NOT NULL DEFAULT 'PLANNED',
    cause_launch_problem_id TEXT DEFAULT '',
    comments TEXT DEFAULT '',
    actual_launch_time TEXT,
    execution_status TEXT NOT NULL DEFAULT 'pending',
    bda_result TEXT
);

-- ФАКТ: Доповіді по контрольних точках (маршрут і час завдання)
CREATE TABLE IF NOT EXISTS public.checkpoint_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID,
    battle_group_id TEXT NOT NULL REFERENCES public.battle_groups(id) ON DELETE CASCADE,
    checkpoint_id TEXT REFERENCES public.checkpoints(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    fixed_time TEXT NOT NULL,
    description TEXT,
    audio_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ФАКТ: Звіти про результати пусків бортів
CREATE TABLE IF NOT EXISTS public.launch_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    launch_id UUID NOT NULL REFERENCES public.launches(id) ON DELETE CASCADE,
    task_id UUID NOT NULL,
    battle_group_id TEXT NOT NULL REFERENCES public.battle_groups(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    actual_launch_time TEXT NOT NULL,
    tracker_model_serial_number TEXT,
    comments TEXT DEFAULT '',
    reported_by_role TEXT NOT NULL DEFAULT 'CREW',
    source_channel TEXT NOT NULL DEFAULT 'TERMINAL',
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================
-- 3. ІНДЕКСИ
-- ========================================================

CREATE INDEX IF NOT EXISTS idx_launches_bg ON public.launches(battle_group_id);
CREATE INDEX IF NOT EXISTS idx_launches_task ON public.launches(task_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_reports_task ON public.checkpoint_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_reports_bg ON public.checkpoint_reports(battle_group_id);
CREATE INDEX IF NOT EXISTS idx_launch_reports_launch ON public.launch_reports(launch_id);
CREATE INDEX IF NOT EXISTS idx_launch_reports_task ON public.launch_reports(task_id);

-- ========================================================
-- 4. ТРИГЕРИ АВТОМАТИЗАЦІЇ
-- ========================================================

-- Оновлення updated_at для таблиці launches
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

-- Автоматична трансляція факту пуску в планову таблицю launches
CREATE OR REPLACE FUNCTION public.sync_launch_report_to_plan()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.launches
    SET 
        execution_status = NEW.status,
        actual_launch_time = NEW.actual_launch_time,
        tracker_model_serial_number = COALESCE(NULLIF(NEW.tracker_model_serial_number, ''), tracker_model_serial_number),
        comments = COALESCE(NEW.comments, comments),
        reported_at = NEW.reported_at,
        updated_at = NOW()
    WHERE id = NEW.launch_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_launch_report ON public.launch_reports;
CREATE TRIGGER trg_sync_launch_report
AFTER INSERT ON public.launch_reports
FOR EACH ROW
EXECUTE FUNCTION public.sync_launch_report_to_plan();

-- ========================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ========================================================

ALTER TABLE public.detachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launch_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read detachments" ON public.detachments FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read battle_groups" ON public.battle_groups FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read checkpoints" ON public.checkpoints FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon select launches" ON public.launches FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon update launches" ON public.launches FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon insert launches" ON public.launches FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon all checkpoint_reports" ON public.checkpoint_reports FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all launch_reports" ON public.launch_reports FOR ALL TO anon USING (true) WITH CHECK (true);

-- ========================================================
-- 6. REALTIME ПУБЛІКАЦІЯ
-- ========================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.launches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checkpoint_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.launch_reports;

-- ========================================================
-- 7. ХРАНИЛИЩЕ ДЛЯ ГОЛОСОВИХ ДОПОВІДЕЙ
-- ========================================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('tactical-voice', 'tactical-voice', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Tactical Voice Access" ON storage.objects;
CREATE POLICY "Public Tactical Voice Access" 
ON storage.objects FOR ALL 
USING (bucket_id = 'tactical-voice')
WITH CHECK (bucket_id = 'tactical-voice');

-- ========================================================
-- 8. RPC ФУНКЦІЯ ДЛЯ СКИДАННЯ ТЕСТУ
-- ========================================================

CREATE OR REPLACE FUNCTION public.reset_demo_mission(
    p_crew_id TEXT DEFAULT '1.1.1',
    p_task_id UUID DEFAULT 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'
)
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.launch_reports WHERE battle_group_id = p_crew_id;
    DELETE FROM public.checkpoint_reports WHERE battle_group_id = p_crew_id;

    UPDATE public.launches
    SET 
        execution_status = 'pending',
        actual_launch_time = NULL,
        comments = '',
        reported_at = NULL,
        reported_at_time = NULL
    WHERE battle_group_id = p_crew_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reset_demo_mission(TEXT, UUID) TO anon, authenticated;

-- ========================================================
-- 9. ПОЧАТКОВІ ДАНІ (SEED DATA)
-- ========================================================

-- Загони
INSERT INTO public.detachments (id, name) VALUES 
    ('detachment_1', '1_Загін'),
    ('detachment_2', '2_Загін'),
    ('detachment_3', '3_Загін')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Екіпажі
INSERT INTO public.battle_groups (id, name, organization_id) VALUES 
    ('1.1.1', '1.1.1', 'detachment_1'),
    ('1.1.2', '1.1.2', 'detachment_1'),
    ('1.1.3', '1.1.3', 'detachment_1'),
    ('2.1.1', '2.1.1', 'detachment_2'),
    ('2.1.2', '2.1.2', 'detachment_2'),
    ('2.1.3', '2.1.3', 'detachment_2'),
    ('3.1.1', '3.1.1', 'detachment_3'),
    ('3.1.2', '3.1.2', 'detachment_3'),
    ('3.1.3', '3.1.3', 'detachment_3')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, organization_id = EXCLUDED.organization_id;

-- Контрольні точки
INSERT INTO public.checkpoints (id, name) VALUES 
    ('checkpoint_1', 'КТ 1'),
    ('checkpoint_2', 'КТ 2'),
    ('checkpoint_3', 'КТ 3'),
    ('checkpoint_4', 'КТ 4'),
    ('checkpoint_5', 'КТ 5')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Бойовий наряд для екіпажу 1.1.1
DELETE FROM public.launches WHERE battle_group_id = '1.1.1';

INSERT INTO public.launches (
    task_id,
    battle_group_id,
    allocation_line_id,
    asset_id,
    asset_serial_number,
    tracker_model_id,
    tracker_model_serial_number,
    aiming_point_mgrs,
    trajectory_name,
    ammo_model_id,
    ammo_quantity,
    launch_status_id,
    execution_status
) VALUES 
(
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    '1.1.1',
    'alloc_01',
    'asset_voron_01',
    '104',
    'trk_model_std',
    'TRK-8821',
    '36U EV 45210 88320',
    '№1',
    'ammo_std_01',
    1,
    'PLANNED',
    'pending'
),
(
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    '1.1.1',
    'alloc_02',
    'asset_voron_01',
    '105',
    'trk_model_std',
    'TRK-8825',
    '36U EV 45210 88320',
    '№2',
    'ammo_std_01',
    1,
    'PLANNED',
    'pending'
),
(
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    '1.1.1',
    'alloc_03',
    'asset_voron_01',
    '106',
    NULL,
    NULL,
    '36U EV 45210 88320',
    '№2',
    'ammo_std_01',
    1,
    'PLANNED',
    'pending'
),
(
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    '1.1.1',
    'alloc_04',
    'asset_voron_01',
    '112',
    'trk_model_std',
    'TRK-9004',
    '36U EV 45210 88320',
    '№3',
    'ammo_std_01',
    1,
    'PLANNED',
    'pending'
);