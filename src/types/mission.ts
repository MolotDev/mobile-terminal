export interface Launch {
  id: string
  task_id: string
  battle_group_id: string
  allocation_line_id: string | null
  asset_id: string
  asset_serial_number: string
  tracker_model_id: string | null
  tracker_model_serial_number: string | null
  aiming_point_mgrs: string
  trajectory_name: string | null
  ammo_model_id: string
  ammo_quantity: number
  created_at: string
  updated_at: string
  archived_at: string | null
  reported_at: string | null
  reported_at_time: string | null
  processed_at: string | null
  launch_status_id: string
  cause_launch_problem_id: string
  comments: string
  actual_launch_time: string | null
  execution_status: string | null
  bda_result: string | null
}
