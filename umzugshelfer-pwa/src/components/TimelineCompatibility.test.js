import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { VerticalTimeline, VerticalTimelineElement } from "react-vertical-timeline-component";

import { setupIntersectionMocking, resetIntersectionMocking, mockAllIsIntersecting } from "react-intersection-observer/test-utils";

beforeEach(() => setupIntersectionMocking(jest.fn));
afterEach(() => resetIntersectionMocking());

test("real timeline renders under the app React renderer and preserves date/click behavior", () => {
  const openTask = jest.fn();
  const { container } = render(
    <VerticalTimeline className="umzug-timeline" layout="2-columns" lineColor="#123456">
      <VerticalTimelineElement date="14.11.2026" icon={<span>Icon</span>} onTimelineElementClick={openTask}>
        <h3>Moving task</h3>
      </VerticalTimelineElement>
    </VerticalTimeline>
  );
  expect(screen.getByText("14.11.2026")).toBeInTheDocument();
  expect(container.querySelector(".umzug-timeline.vertical-timeline--two-columns")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Moving task"));
  expect(openTask).toHaveBeenCalledTimes(1);
  act(() => mockAllIsIntersecting(true));
  expect(container.querySelector(".vertical-timeline-element-content.bounce-in")).toBeInTheDocument();
});
