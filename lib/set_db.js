const { DataTypes, Sequelize } = require('sequelize');

const DATABASE = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, { dialectOptions: { ssl: { rejectUnauthorized: false } }, logging: false })
  : new Sequelize({ dialect: 'sqlite', storage: './database/settings.db', logging: false });

async function get_set(key) {
  const Settings = DATABASE.define('settings', {
    key: { type: DataTypes.STRING, allowNull: false },
    value: { type: DataTypes.TEXT, allowNull: false },
  }, { timestamps: false });
  await DATABASE.sync();

  const rows = await Settings.findAll();
  if (rows.length > 0) {
    const json = JSON.parse(rows[0].dataValues.value);
    if (key === 'settings') return json;
    if (json[key]) return json[key];
    return false;
  } else {
    return {};
  }
}

async function input_set(key, value) {
  const Settings = DATABASE.define('settings', {
    key: { type: DataTypes.STRING, allowNull: false },
    value: { type: DataTypes.TEXT, allowNull: false },
  }, { timestamps: false });
  await DATABASE.sync();

  const rows = await Settings.findAll();
  if (rows.length > 0) {
    const json = JSON.parse(rows[0].dataValues.value);
    json[key] = value;
    await rows[0].update({ value: JSON.stringify(json) });
  } else {
    const json = { [key]: value };
    await Settings.create({ value: JSON.stringify(json) });
  }
}

module.exports = { get_set, input_set };