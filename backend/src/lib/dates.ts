/** Age in whole years as of a given date (defaults to now). */
export const ageOn = (dob: Date, when: Date = new Date()) => {
  let age = when.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthdayThisYear =
    when.getUTCMonth() < dob.getUTCMonth() ||
    (when.getUTCMonth() === dob.getUTCMonth() && when.getUTCDate() < dob.getUTCDate());
  if (beforeBirthdayThisYear) age--;
  return age;
};
