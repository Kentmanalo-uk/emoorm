-- How a reviewer chose to be named on their own review. Expand only: the
-- version still live writes nothing here and every existing review keeps
-- showing the name it always did.
--
-- ANONYMOUS is not a display rule the apps are trusted to honour. The
-- review service drops the name, the username, the photo and the user id
-- from the payload before it leaves, because a rule the client applies is
-- one anybody can read straight out of the response.
ALTER TABLE `reviews`
  ADD COLUMN `display_as` ENUM('NAME', 'USERNAME', 'ANONYMOUS') NOT NULL DEFAULT 'NAME';
