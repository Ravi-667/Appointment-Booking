const { Kafka, Partitioners } = require("kafkajs");

const kafka = new Kafka({
  clientId: "booking-api",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  retry: { retries: 3 },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
});
let producerConnected = false;

async function connectProducer() {
  if (!producerConnected) {
    await producer.connect();
    producerConnected = true;
    console.log("✓ Kafka producer connected");
  }
}

async function publish(topic, message, key) {
  try {
    await connectProducer();
    await producer.send({
      topic,
      messages: [{ key: key || null, value: JSON.stringify(message) }],
    });
  } catch (err) {
    // Kafka failure must never break booking flow
    console.error(`Kafka publish failed (${topic}):`, err.message);
  }
}

async function createConsumer(groupId) {
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  return consumer;
}

module.exports = { publish, createConsumer };

