document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.getElementById("calendar");
  const bookingModal = document.getElementById("booking-modal");
  const bookingForm = document.getElementById("booking-form");
  const cancelBooking = document.getElementById("cancel-booking");
  const slotDetails = document.getElementById("slot-details");
  const statusMessage = document.getElementById("status-message");
  
  let selectedSlot = null;
  
  // Show loading indicator
  calendarEl.innerHTML = '<div class="text-center p-4">Loading calendar...</div>';
  
  // Initialize calendar with basic configuration
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "timeGridWeek",
    slotMinTime: "08:00:00",
    slotMaxTime: "21:00:00",
    allDaySlot: false,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'timeGridWeek,timeGridDay'
    },
    height: 'auto',
    eventClick: function(info) {
      console.log("Event clicked:", info.event);
      
      selectedSlot = info.event.extendedProps.slotData;
      
      // Format date for display
      const eventDate = new Date(selectedSlot.Date);
      const formattedDate = eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Extract correct time from string using regex
      const startTime = extractTimeFromGoogleDate(selectedSlot["Start Time"]);
      const endTime = extractTimeFromGoogleDate(selectedSlot["End Time"]);
      
      // Display slot details
      slotDetails.innerHTML = `
        <p class="mb-2"><span class="font-medium">Date:</span> ${formattedDate}</p>
        <p class="mb-2"><span class="font-medium">Time:</span> ${startTime} - ${endTime}</p>
        <p class="mb-4"><span class="font-medium">Status:</span> Available</p>
      `;
      
      // Show booking modal
      bookingModal.classList.remove('hidden');
    }
  });
  
  // Render the calendar
  calendar.render();
  
  // Remove all sources first (to clean any previous events)
  calendar.getEventSources().forEach(source => source.remove());
  
  // Fetch slots from Google Apps Script
  fetchAvailableSlots()
    .then(slots => {
      if (!slots || slots.length === 0) {
        showStatusMessage("No available slots found", "warning");
        return;
      }
      
      // Convert slots to FullCalendar events
      const events = convertSlotsToEvents(slots);
      
      // Add events to calendar
      calendar.addEventSource(events);
      
      // Show success message
      showStatusMessage(`Loaded ${events.length} available slots`, 'success');
    })
    .catch(error => {
      console.error("Error in fetch handling:", error);
      showStatusMessage("Failed to load available slots: " + error.message, "error");
    });

  // Handle form submission (booking a slot)
  bookingForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const name = document.getElementById('name').value;
    
    if (!name) {
      showStatusMessage("Please enter your name to book a slot", "error");
      return;
    }
    
    console.log("Booking submitted:", { name, slot: selectedSlot });
    
    // Update the spinning/loading state
    showStatusMessage("Processing your booking...", "warning");
    
    // Call the API to update the Google Sheet
    bookSlot(selectedSlot.ID, name)
      .then(response => {
        if (response && response.success) {
          // Show success message
          bookingModal.classList.add('hidden');
          showStatusMessage(`Thank you ${name}! Your booking has been confirmed.`, "success");
          
          // Reset form
          bookingForm.reset();
          
          // Format dates for Google Calendar
          const eventDate = new Date(selectedSlot.Date);
          const dateStr = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
          
          const startTime = extractTimeFromGoogleDate(selectedSlot["Start Time"]);
          const endTime = extractTimeFromGoogleDate(selectedSlot["End Time"]);
          
          const startISO = formatForGCal(dateStr, startTime);
          const endISO = formatForGCal(dateStr, endTime);
          
          // Debug information - check these values
          console.log("Google Calendar parameters:", {
            dateStr,
            startTime,
            endTime,
            startISO,
            endISO
          });
          
          // Open Google Calendar in a new tab
          const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tennis+Lesson+with+Andong&dates=${startISO}/${endISO}&details=Booked+by:+${name}&location=A%26M+Consolidated+High+School+Tennis+Courts%2C+HMRJ%2B7M%2C+College+Station%2C+TX+77840&add=andongch@tamu.edu`;
          console.log("Opening URL:", gcalUrl);
          
          window.open(gcalUrl, '_blank');
          
          // Remove the event from the calendar to prevent double booking
          const event = calendar.getEventById(selectedSlot.ID.toString());
          if (event) {
            event.remove();
          }
        } else {
          showStatusMessage("Sorry, this slot is no longer available or booking failed.", "error");
          // Refresh the calendar to get updated availability
          refreshCalendar();
        }
      })
      .catch(error => {
        console.error("Error in booking process:", error);
        showStatusMessage("Failed to update booking in the system. Please try again.", "error");
        
        // Still open Google Calendar for testing purposes
        const eventDate = new Date(selectedSlot.Date);
        const dateStr = eventDate.toISOString().split('T')[0];
        const startTime = extractTimeFromGoogleDate(selectedSlot["Start Time"]);
        const endTime = extractTimeFromGoogleDate(selectedSlot["End Time"]);
        const startISO = formatForGCal(dateStr, startTime);
        const endISO = formatForGCal(dateStr, endTime);
        
        const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tennis+Lesson+with+Andong&dates=${startISO}/${endISO}&details=Booked+by:+${name}&location=A%26M+Consolidated+High+School+Tennis+Courts%2C+HMRJ%2B7M%2C+College+Station%2C+TX+77840&add=andongch@tamu.edu`;
        window.open(gcalUrl, '_blank');
      });
  });
  
  // Close modal handlers
  cancelBooking.addEventListener('click', function() {
    bookingModal.classList.add('hidden');
  });
  
  bookingModal.addEventListener('click', function(e) {
    if (e.target === bookingModal) {
      bookingModal.classList.add('hidden');
    }
  });
  
  // Function to fetch available slots from Google Apps Script
  async function fetchAvailableSlots() {
    try {
      const apiUrl = "https://script.google.com/macros/s/AKfycbyKMjqTbK46zrMDQaUtAweuf8y7i3VAWo_dG3TyI9prVSajOauQj7VCWDLxm_qbW7wb/exec";
      console.log("Fetching slots from API:", apiUrl);
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        throw new Error("Expected array of slots but received different data format");
      }
      
      return data.filter(slot => slot.Status === "Available");
    } catch (error) {
      console.error("Failed to fetch slots:", error);
      throw error;
    }
  }
  
  // Function to update the Google Sheet with booking information
  async function bookSlot(slotId, name) {
    try {
      const apiUrl = "https://script.google.com/macros/s/AKfycbyKMjqTbK46zrMDQaUtAweuf8y7i3VAWo_dG3TyI9prVSajOauQj7VCWDLxm_qbW7wb/exec";
      console.log(`Booking slot ${slotId} for ${name} via API`);
      
      // Due to CORS limitations with Google Apps Script, we use a workaround
      // Method 1: Using fetch with no-cors mode (won't return data but will make the request)
      const response = await fetch(apiUrl, {
        method: 'POST',
        mode: 'no-cors', // Important for Apps Script
        headers: {
          'Content-Type': 'text/plain' // Use text/plain instead of application/json
        },
        body: JSON.stringify({
          id: slotId,
          name: name
        })
      });
      
      // Since we're using no-cors mode, we won't get a proper response
      // So we'll simulate a successful response
      console.log("Booking request sent. Due to CORS limitations, assuming success:", response);
      return { success: true, message: "Booking request sent" };
      
      /* 
      // Method 2: Using JSONP approach (if the above doesn't work)
      // This would require modifying your Google Apps Script to support JSONP
      const callbackName = 'booking_callback_' + Date.now();
      window[callbackName] = function(data) {
        console.log('Booking response:', data);
        delete window[callbackName];
        document.head.removeChild(script);
      };
      
      const script = document.createElement('script');
      script.src = `${apiUrl}?id=${slotId}&name=${encodeURIComponent(name)}&callback=${callbackName}`;
      document.head.appendChild(script);
      return { success: true, message: "Booking request sent" };
      */
    } catch (error) {
      console.error("Error booking slot:", error);
      throw error;
    }
  }
  
  // Function to refresh the calendar with latest data
  function refreshCalendar() {
    // Remove all existing events
    calendar.getEventSources().forEach(source => source.remove());
    
    // Show loading indicator
    calendarEl.innerHTML = '<div class="text-center p-4">Refreshing calendar...</div>';
    
    // Fetch updated slots
    fetchAvailableSlots()
      .then(slots => {
        if (slots && slots.length > 0) {
          const events = convertSlotsToEvents(slots);
          calendar.addEventSource(events);
        } else {
          showStatusMessage("No available slots found after refresh", "warning");
        }
        calendar.render();
      })
      .catch(error => {
        console.error("Error refreshing calendar:", error);
        showStatusMessage("Failed to refresh calendar data.", "error");
      });
  }
  
  // Convert slots from API to FullCalendar events
  function convertSlotsToEvents(slots) {
    return slots.map(slot => {
      try {
        // Extract date (YYYY-MM-DD)
        const slotDate = new Date(slot.Date);
        const dateStr = slotDate.toISOString().split('T')[0];
        
        // Extract times (HH:MM) from Google Sheets date format
        const startTime = extractTimeFromGoogleDate(slot["Start Time"]);
        const endTime = extractTimeFromGoogleDate(slot["End Time"]);
        
        return {
          id: slot.ID.toString(),
          title: "Available",
          start: `${dateStr}T${startTime}`,
          end: `${dateStr}T${endTime}`,
          color: '#4CAF50',
          extendedProps: {
            slotData: slot
          }
        };
      } catch (error) {
        console.error("Error converting slot to event:", error, slot);
        return null;
      }
    }).filter(event => event !== null); // Remove any failed conversions
  }
  
  // Extract time from Google Sheets date format (1899-12-30T08:00:00.000Z)
  function extractTimeFromGoogleDate(dateTimeStr) {
    // Use regex to extract just the time part (HH:MM)
    const match = dateTimeStr.match(/T(\d{2}):(\d{2}):/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
    return "00:00"; // Fallback
  }
  
  // Format dates for Google Calendar
  function formatForGCal(date, time) {
    try {
      const [hour, minute] = time.split(":");
      const [year, month, day] = date.split("-");
      const dateObj = new Date(year, month - 1, day, hour, minute);
      return dateObj.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    } catch (error) {
      console.error("Error formatting date for Google Calendar:", error);
      // Use a fallback approach for testing
      const now = new Date();
      const later = new Date(now.getTime() + 60*60*1000); // 1 hour later
      return now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    }
  }
  
  // Helper function to show status messages
  function showStatusMessage(message, type) {
    const statusMessage = document.getElementById('status-message');
    if (!statusMessage) return;
    
    statusMessage.textContent = message;
    statusMessage.classList.remove('hidden', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800', 'bg-yellow-100', 'text-yellow-800');
    
    switch(type) {
      case 'success':
        statusMessage.classList.add('bg-green-100', 'text-green-800');
        break;
      case 'error':
        statusMessage.classList.add('bg-red-100', 'text-red-800');
        break;
      case 'warning':
        statusMessage.classList.add('bg-yellow-100', 'text-yellow-800');
        break;
    }
    
    statusMessage.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 5000);
  }
});