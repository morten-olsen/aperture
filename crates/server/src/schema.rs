use std::sync::Arc;

use axum::extract::State;
use axum::Json;

use aperture_protocol::{ActionSchema, EventSchema, SchemaDocument};

use crate::ws::AppState;

pub async fn schema_handler(State(state): State<Arc<AppState>>) -> Json<SchemaDocument> {
    let actions: Vec<ActionSchema> = state
        .engine
        .actions()
        .iter()
        .map(|a| ActionSchema {
            id: a.id.clone(),
            description: a.description.clone(),
            input_schema: a.input_schema.clone(),
            output_schema: a.output_schema.clone(),
        })
        .collect();

    let event_schemas = state.engine.events().event_schemas().await;
    let events: Vec<EventSchema> = event_schemas
        .into_iter()
        .map(|(id, schema)| EventSchema {
            id,
            payload_schema: Some(schema),
        })
        .collect();

    Json(SchemaDocument { actions, events })
}
