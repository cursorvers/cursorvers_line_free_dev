-- Set PostgreSQL timezone to Asia/Tokyo (JST)
ALTER DATABASE postgres SET timezone TO 'Asia/Tokyo';

-- Verify timezone setting
SHOW timezone;
