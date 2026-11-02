const { getSubject } = require('../content/subjects');

/**
 * router.param('subject', loadSubject): resolves the :subject URL segment to
 * a subject object on req.subject (and its admin URL prefix on
 * res.locals.base), or 404s for an unknown one.
 */
function loadSubject(req, res, next, id) {
  const subject = getSubject(id);
  if (!subject) return res.status(404).send('Unknown subject.');
  req.subject = subject;
  res.locals.subject = subject;
  res.locals.base = '/admin/s/' + subject.id;
  next();
}

module.exports = loadSubject;
