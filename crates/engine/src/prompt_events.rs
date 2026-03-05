use crate::event::EventDescriptor;
use crate::prompt::Prompt;

pub static PROMPT_CREATED: EventDescriptor<Prompt> = EventDescriptor::new("prompt.created");
pub static PROMPT_UPDATED: EventDescriptor<Prompt> = EventDescriptor::new("prompt.updated");
pub static PROMPT_COMPLETED: EventDescriptor<Prompt> = EventDescriptor::new("prompt.completed");
pub static PROMPT_WAITING_FOR_APPROVAL: EventDescriptor<Prompt> =
    EventDescriptor::new("prompt.waiting_for_approval");
