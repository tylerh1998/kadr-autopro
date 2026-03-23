import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { ro_number, action } = await req.json().catch(() => ({}));

    if (!ro_number) {
      return Response.json({ success: false, error: 'ro_number is required' }, { status: 400 });
    }

    if (!['apply', 'release'].includes(action)) {
      return Response.json({ success: false, error: 'action must be apply or release' }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const escapedEmail = user.email.replaceAll('"', '\\"');
    const getMountainTimeISOString = () => {
      const now = new Date();
      const dateParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Edmonton',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).formatToParts(now).reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});

      const offsetLabel = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Edmonton',
        timeZoneName: 'shortOffset'
      }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value || 'GMT-7';

      const offsetMatch = offsetLabel.replace('GMT', '').match(/^([+-])?(\d{1,2})(?::?(\d{2}))?$/);
      const offsetSign = offsetMatch?.[1] || '-';
      const offsetHours = String(offsetMatch?.[2] || '7').padStart(2, '0');
      const offsetMinutes = String(offsetMatch?.[3] || '00').padStart(2, '0');

      return `${dateParts.year}-${dateParts.month}-${dateParts.day}T${dateParts.hour}:${dateParts.minute}:${dateParts.second}.${String(now.getMilliseconds()).padStart(3, '0')}${offsetSign}${offsetHours}:${offsetMinutes}`;
    };

    if (action === 'apply') {
      const now = getMountainTimeISOString();

      const { data: lockedWorkOrder, error: updateError } = await supabase
        .from('WorkOrder')
        .update({ LockedByUser: user.email, locked_timestamp: now })
        .eq('ro_number', ro_number)
        .or(`LockedByUser.is.null,LockedByUser.eq."",LockedByUser.eq."${escapedEmail}"`)
        .select('id, ro_number, LockedByUser, locked_timestamp')
        .maybeSingle();

      if (updateError) {
        return Response.json({ success: false, error: updateError.message || 'Failed to acquire work order lock' }, { status: 500 });
      }

      if (lockedWorkOrder) {
        return Response.json({
          success: true,
          lockAcquired: true,
          data: lockedWorkOrder
        });
      }

      const { data: existingWorkOrder, error: readError } = await supabase
        .from('WorkOrder')
        .select('id, ro_number, LockedByUser, locked_timestamp')
        .eq('ro_number', ro_number)
        .maybeSingle();

      if (readError) {
        return Response.json({ success: false, error: readError.message || 'Failed to read work order lock status' }, { status: 500 });
      }

      if (!existingWorkOrder) {
        return Response.json({ success: false, error: 'Work order not found' }, { status: 404 });
      }

      const lockedByUser = existingWorkOrder.LockedByUser || '';
      const lockedAt = existingWorkOrder.locked_timestamp ? new Date(existingWorkOrder.locked_timestamp) : null;
      const isStaleLock = lockedByUser &&
        lockedByUser !== user.email &&
        lockedAt &&
        !Number.isNaN(lockedAt.getTime()) &&
        ((Date.now() - lockedAt.getTime()) / 60000) > 120;

      if (isStaleLock) {
        const { data: staleLockOverride, error: staleLockError } = await supabase
          .from('WorkOrder')
          .update({ LockedByUser: user.email, locked_timestamp: now })
          .eq('ro_number', ro_number)
          .eq('LockedByUser', existingWorkOrder.LockedByUser)
          .eq('locked_timestamp', existingWorkOrder.locked_timestamp)
          .select('id, ro_number, LockedByUser, locked_timestamp')
          .maybeSingle();

        if (staleLockError) {
          return Response.json({ success: false, error: staleLockError.message || 'Failed to override stale work order lock' }, { status: 500 });
        }

        if (staleLockOverride) {
          return Response.json({
            success: true,
            lockAcquired: true,
            data: staleLockOverride
          });
        }
      }

      return Response.json({
        success: false,
        lockAcquired: false,
        lockedByUser,
        message: lockedByUser
          ? `Edit lock was not obtained. ${lockedByUser} locked this work order before your lock completed.`
          : 'Edit lock was not obtained.'
      }, { status: 409 });
    }

    const { data: releasedWorkOrder, error: releaseError } = await supabase
      .from('WorkOrder')
      .update({ LockedByUser: null, locked_timestamp: null })
      .eq('ro_number', ro_number)
      .or(`LockedByUser.is.null,LockedByUser.eq."",LockedByUser.eq."${escapedEmail}"`)
      .select('id, ro_number, LockedByUser, locked_timestamp')
      .maybeSingle();

    if (releaseError) {
      return Response.json({ success: false, error: releaseError.message || 'Failed to release work order lock' }, { status: 500 });
    }

    if (releasedWorkOrder) {
      return Response.json({
        success: true,
        released: true,
        data: releasedWorkOrder
      });
    }

    const { data: existingWorkOrder, error: readError } = await supabase
      .from('WorkOrder')
      .select('id, ro_number, LockedByUser, locked_timestamp')
      .eq('ro_number', ro_number)
      .maybeSingle();

    if (readError) {
      return Response.json({ success: false, error: readError.message || 'Failed to read work order lock status' }, { status: 500 });
    }

    if (!existingWorkOrder) {
      return Response.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const lockedByUser = existingWorkOrder.LockedByUser || '';

    return Response.json({
      success: false,
      released: false,
      lockedByUser,
      message: lockedByUser
        ? `Work order lock is currently held by ${lockedByUser}.`
        : 'Work order lock release was not required.'
    }, { status: 409 });
  } catch (error) {
    return Response.json({ success: false, error: error.message || 'Failed to manage work order lock' }, { status: 500 });
  }
});