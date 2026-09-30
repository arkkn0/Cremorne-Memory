import { Neo4jCapacityGraph } from '../server/graph'

const graph = new Neo4jCapacityGraph()
await graph.ensureSeeded()
console.log('Cremorne Capacity Graph seeded in Neo4j.')

