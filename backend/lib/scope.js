// Pick the space a new or edited row should live in: an explicit space_id the
// user is a member of, or their personal (private) space by default. Throws 400
// if they try to write to a space they don't belong to.
export function targetSpace(req, requested) {
  const id = requested || req.personalSpaceId;
  if (!req.spaceIds.includes(id)) {
    const err = new Error('You are not a member of that space');
    err.status = 400;
    throw err;
  }
  return id;
}
