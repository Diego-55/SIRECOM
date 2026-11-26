// Variables mínimas para cargar la configuración sin necesidad de un .env ni de MongoDB
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-pruebas-con-mas-de-32-caracteres-123456';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = '100000';
