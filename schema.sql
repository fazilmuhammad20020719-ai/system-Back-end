-- Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Admin User
-- Password is 'Admin1234#' hashed with bcrypt (cost 10)
-- You can generate a new hash using a tool or the backend logic
INSERT INTO users (username, password_hash, role)
VALUES ('admin', '$2y$10$Kq.1ZCWMRg1ME8L8zVfaD.G331ZXsG2fiHlFHr/7ljyz9BDNUAtM6', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Programs Table
CREATE TABLE IF NOT EXISTS programs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    head_of_program VARCHAR(100),
    type VARCHAR(50),
    color_theme VARCHAR(50),
    duration VARCHAR(50),
    fees VARCHAR(50),
    status VARCHAR(20) DEFAULT 'Active'
);

-- Students Table
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    program_id INTEGER REFERENCES programs(id),
    current_year VARCHAR(50),
    session_year VARCHAR(10),
    guardian_name VARCHAR(100),
    contact_number VARCHAR(20),
    status VARCHAR(20) DEFAULT 'Active'
);

-- Teachers Table
CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    emp_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    program_id INTEGER REFERENCES programs(id),
    subject VARCHAR(100),
    role VARCHAR(50),
    email VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    nic VARCHAR(20),
    dob DATE,
    joining_date DATE,
    designation VARCHAR(100),
    qualification VARCHAR(255),
    status VARCHAR(20) DEFAULT 'Active'
);

-- Documents Table
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20),
    category VARCHAR(50),
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activities Table (for minimal recent activity feed)
CREATE TABLE IF NOT EXISTS activities (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon_type VARCHAR(50), -- 'UserPlus', 'FileText', 'Upload', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    message VARCHAR(255),
    icon_type VARCHAR(50), -- 'CreditCard', 'AlertTriangle', 'Bell', 'Calendar'
    due_date DATE,
    color_theme VARCHAR(50) -- e.g. 'red', 'orange'
);

