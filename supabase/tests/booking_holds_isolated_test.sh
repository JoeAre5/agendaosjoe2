# Run ONLY against an isolated draft database (psql -U postgres). Never production.
set -e
P="psql -U postgres -t -A -q"
B=$($P -c "SELECT id FROM barbers WHERE is_active LIMIT 1")
B2=$($P -c "SELECT id FROM barbers WHERE is_active AND id<>'$B' LIMIT 1")
mk(){ $P -c "INSERT INTO booking_drafts(source,appointment_type_id,calendar_id,barber_id,datetime,first_name,phone,total_cents) VALUES('client_app',1,1,'$1','$2','T','7870000000',100) RETURNING id" | head -1; }
S=2026-12-01T14:00:00Z; E=2026-12-01T14:30:00Z
D1=$(mk $B $S); D2=$(mk $B $S)
acq(){ $P -c "SELECT acquire_booking_hold('$1','$2','$3','$4',30)->>'success'" ; }
# simultaneous
acq $D1 $B $S $E > /tmp/r1 & acq $D2 $B $S $E > /tmp/r2 & wait
echo "simultaneous: $(cat /tmp/r1) $(cat /tmp/r2)"
D3=$(mk $B $S); echo "partial overlap 14:15: $(acq $D3 $B 2026-12-01T14:15:00Z 2026-12-01T14:45:00Z)"
echo "adjacent 14:30: $(acq $D3 $B 2026-12-01T14:30:00Z 2026-12-01T15:00:00Z)"
D4=$(mk $B2 $S); echo "other barber: $(acq $D4 $B2 $S $E)"
W=$(grep -l true /tmp/r1 >/dev/null && echo $D1 || echo $D2)
$P -c "SELECT release_booking_hold('$W')" >/dev/null
D5=$(mk $B $S); echo "after release: $(acq $D5 $B $S $E)"
$P -c "UPDATE booking_draft_holds SET expires_at=now()-interval '1 min' WHERE draft_id='$D5'"
D6=$(mk $B $S); echo "after expiry: $(acq $D6 $B $S $E)"
echo "renew own hold: $(acq $D6 $B $S $E)"
echo "invalid range: $($P -c "SELECT acquire_booking_hold('$D6','$B','$E','$S',30)->>'reason'")"
echo "anon exec: $(psql -U postgres -t -A -c "SET ROLE anon; SELECT acquire_booking_hold('$D6','$B','$S','$E',30)" 2>&1 | head -1)"
$P -c "DELETE FROM booking_drafts WHERE first_name='T' AND phone='7870000000'"
