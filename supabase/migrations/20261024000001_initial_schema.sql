-- ========================================================
-- 1. СТВОРЕННЯ ДОВІДНИКІВ (MVP PLANNING)
-- ========================================================

-- Таблиця загонів
CREATE TABLE IF NOT EXISTS public.detachments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Таблиця екіпажів (battle_groups)
CREATE TABLE IF NOT EXISTS public.battle_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    organization_id TEXT NOT NULL REFERENCES public.detachments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Довідник контрольних точок
CREATE TABLE IF NOT EXISTS public.checkpoints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================
-- 2. РОБОЧІ ТАБЛИЦІ (ПУСКИ ТА ЗВІТИ З ПОЛЯ)
-- ========================================================

-- Таблиця пусків (структура точно відповідає createLaunchRecord)
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

-- Таблиця звітів по КТ від терміналу
CREATE TABLE IF NOT EXISTS public.checkpoint_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- ========================================================
-- 3. ТРИГЕРИ ТА ІНДЕКСИ
-- ========================================================

CREATE INDEX IF NOT EXISTS idx_launches_battle_group ON public.launches(battle_group_id);
CREATE INDEX IF NOT EXISTS idx_launches_task_id ON public.launches(task_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_reports_bg ON public.checkpoint_reports(battle_group_id);

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

-- ========================================================
-- 4. ПОЛІТИКИ ДОСТУПУ (RLS ДЛЯ РОЛІ anon)
-- ========================================================

ALTER TABLE public.detachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_reports ENABLE ROW LEVEL SECURITY;

-- Доступ до довідників на читання
DROP POLICY IF EXISTS "Allow anon read detachments" ON public.detachments;
CREATE POLICY "Allow anon read detachments" ON public.detachments FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read battle_groups" ON public.battle_groups;
CREATE POLICY "Allow anon read battle_groups" ON public.battle_groups FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read checkpoints" ON public.checkpoints;
CREATE POLICY "Allow anon read checkpoints" ON public.checkpoints FOR SELECT TO anon USING (true);

-- Доступ до пусків (читання наряду, оновлення статусу, додавання)
DROP POLICY IF EXISTS "Allow anon select launches" ON public.launches;
CREATE POLICY "Allow anon select launches" ON public.launches FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon update launches" ON public.launches;
CREATE POLICY "Allow anon update launches" ON public.launches FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon insert launches" ON public.launches;
CREATE POLICY "Allow anon insert launches" ON public.launches FOR INSERT TO anon WITH CHECK (true);

-- Доступ до звітів контрольних точок
DROP POLICY IF EXISTS "Allow anon all on checkpoint_reports" ON public.checkpoint_reports;
CREATE POLICY "Allow anon all on checkpoint_reports" ON public.checkpoint_reports FOR ALL TO anon USING (true) WITH CHECK (true);

-- ========================================================
-- 5. БАКЕТ СХОВИЩА ДЛЯ ГОЛОСОВИХ ЗВІТІВ
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
-- 6. НАПОВНЕННЯ ДАНИМИ З MVP PLANNING
-- ========================================================

-- Загони (DETACHMENT_REFS)
INSERT INTO public.detachments (id, name) VALUES 
    ('detachment_1', '1_Загін'),
    ('detachment_2', '2_Загін'),
    ('detachment_3', '3_Загін')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Екіпажі (CREWS)
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

-- Контрольні точки (CHECKPOINTS)
INSERT INTO public.checkpoints (id, name) VALUES 
    ('checkpoint_1', 'КТ 1'),
    ('checkpoint_2', 'КТ 2'),
    ('checkpoint_3', 'КТ 3'),
    ('checkpoint_4', 'КТ 4'),
    ('checkpoint_5', 'КТ 5')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ========================================================
-- 7. ТЕСТОВИЙ БОЙОВИЙ НАРЯД ДЛЯ ЕКІПАЖУ 1.1.1
-- ========================================================

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