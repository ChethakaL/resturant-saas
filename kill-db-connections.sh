#!/bin/bash

# Kill all connections to the database
PGPASSWORD=WORKFLOW_PASSWORD psql -h 54.169.179.180 -U postgres -d postgres -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'restaurant_test' 
  AND pid <> pg_backend_pid()
  AND usename = 'workflow_app';
"

echo "All connections to restaurant_test database have been terminated"
