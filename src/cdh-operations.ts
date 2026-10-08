export type OperationsState = 'active' | 'published' | 'partner-connection'

export interface PrecinctAsset {
  id: string
  name: string
  address: string
  owner: string
  capability: string
  state: OperationsState
  source: string
  position?: [number, number]
}

export interface IntegrationContract {
  id: string
  name: string
  owner: string
  interface: string
  cadence: string
  state: OperationsState
  action: string
}

export interface CdhOperationsModel {
  precinct: 'Cremorne'
  generatedAt: string
  assets: {
    sensors: PrecinctAsset[]
    venues: PrecinctAsset[]
  }
  integrations: IntegrationContract[]
}

const YARRA_SMART_POLE_SOURCE = 'https://www.yarracity.vic.gov.au/about-us/news-and-media/smart-poles-coming-to-cremorne'
const CDH_VENUE_SOURCE = 'https://www.cremornedigitalhub.com.au/events/'

const publishedSensorLocations: Array<{ address: string; position: [number, number] }> = [
  { address: '60 Swan Street', position: [-37.8248058, 144.9898166] },
  { address: '60–88 Cremorne Street', position: [-37.8274189, 144.9903530] },
  { address: '85 Cremorne Street', position: [-37.8274816, 144.9913024] },
  { address: '168 Cremorne Street', position: [-37.8304209, 144.9900444] },
  { address: '53 Balmain Street', position: [-37.8299458, 144.9932039] },
  { address: '80 Balmain Street · CDH', position: [-37.8303616, 144.9945530] },
]

export const cdhSensorAssets: PrecinctAsset[] = publishedSensorLocations.map(({ address, position }, index) => ({
  id: `smart-pole-${index + 1}`,
  name: `Smart pole ${String(index + 1).padStart(2, '0')}`,
  address,
  owner: 'City of Yarra',
  capability: 'Foot traffic · street traffic · air quality',
  state: 'published' as const,
  source: YARRA_SMART_POLE_SOURCE,
  position,
}))

export const cdhVenueAssets: PrecinctAsset[] = [
  {
    id: 'cdh-boardroom',
    name: 'CDH Boardroom',
    address: '80 Balmain Street',
    owner: 'Cremorne Digital Hub',
    capability: '12 people · video conference · street-level access',
    state: 'published',
    source: CDH_VENUE_SOURCE,
  },
  {
    id: 'cdh-workshop',
    name: 'CDH Workshop Space',
    address: '80 Balmain Street',
    owner: 'Cremorne Digital Hub',
    capability: '24–40 people · flexible setup · presentation technology',
    state: 'published',
    source: CDH_VENUE_SOURCE,
  },
  {
    id: 'cdh-event-space',
    name: 'CDH Event Space',
    address: '80 Balmain Street',
    owner: 'Cremorne Digital Hub',
    capability: '80 seated · 100 standing · AV · hybrid Zoom',
    state: 'published',
    source: CDH_VENUE_SOURCE,
  },
]

export const cdhIntegrationContracts: IntegrationContract[] = [
  {
    id: 'decision-api',
    name: 'Decision API',
    owner: 'Cremorne Memory',
    interface: 'Structured need · eligible options · score trace · Memory',
    cadence: 'Per request',
    state: 'active',
    action: 'Running',
  },
  {
    id: 'smart-poles',
    name: 'Yarra movement feed',
    owner: 'City of Yarra / sensor vendor',
    interface: 'Timestamp · pole ID · movement count · direction · quality flag',
    cadence: 'Agree with data owner',
    state: 'partner-connection',
    action: 'Request sample export',
  },
  {
    id: 'room-availability',
    name: 'CDH space availability',
    owner: 'CDH venue operations',
    interface: 'Space ID · open window · capacity · capability · access class',
    cadence: 'Booking event',
    state: 'partner-connection',
    action: 'Map booking source',
  },
  {
    id: 'pilot-identity',
    name: 'Pilot participant identity',
    owner: 'CDH pilot owner',
    interface: 'Pseudonymous profile · tenancy membership · consent state',
    cadence: 'Participant event',
    state: 'partner-connection',
    action: 'Confirm cohort workflow',
  },
]

export function buildCdhOperationsModel(): CdhOperationsModel {
  return {
    precinct: 'Cremorne',
    generatedAt: new Date().toISOString(),
    assets: {
      sensors: cdhSensorAssets,
      venues: cdhVenueAssets,
    },
    integrations: cdhIntegrationContracts,
  }
}

