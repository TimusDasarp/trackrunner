import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Box, IconButton, Popover, Typography } from "@mui/material";
import { useState } from "react";

/**
 * A compact, reusable explanation of the runner location indicators. The dots
 * remain beside runner names, while this guide avoids repeating a full legend
 * in every workspace.
 */
export default function RunnerStatusGuide() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);

  return <>
    <IconButton
      aria-label="Open runner location status guide"
      aria-describedby={open ? "runner-status-guide" : undefined}
      onClick={(event) => setAnchor(event.currentTarget)}
      size="small"
      sx={{ width: 28, height: 28, color: "text.secondary" }}
    >
      <InfoOutlinedIcon fontSize="small" />
    </IconButton>
    <Popover
      id="runner-status-guide"
      open={open}
      anchorEl={anchor}
      onClose={() => setAnchor(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      PaperProps={{ sx: { mt: 0.75, width: 272, p: 1.75, borderRadius: 2.5 } }}
    >
      <Typography fontWeight={800}>Runner location status</Typography>
      <Typography variant="body2" color="text.secondary" mt={0.4} mb={1.5}>
        The coloured dot beside a runner name shows how their location is shared.
      </Typography>
      <StatusRow color="#059669" label="Location always allowed" detail="The runner can share live location in the background." />
      <StatusRow color="#d97706" label="Location when app is open" detail="Location updates only while the runner app is in use." />
      <StatusRow color="#64748b" label="Offline" detail="The runner app or device is currently unavailable." />
    </Popover>
  </>;
}

function StatusRow({ color, label, detail }: { color: string; label: string; detail: string }) {
  return <Box display="flex" gap={1.25} mb={1.25}>
    <Box sx={{ width: 9, height: 9, mt: 0.65, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
    <Box>
      <Typography variant="body2" fontWeight={750}>{label}</Typography>
      <Typography variant="caption" color="text.secondary">{detail}</Typography>
    </Box>
  </Box>;
}
